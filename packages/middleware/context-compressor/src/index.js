export const contextCompressor = (opts = {}) => {
    const maxChars = opts.maxChars ?? 200_000;
    const keepRecent = opts.keepRecent ?? 8;
    const summaryMaxChars = opts.summaryMaxChars ?? 12_000;
    return async (ctx, next) => {
        const original = ctx.model;
        ctx.model = wrapModelWithCompression(original, { maxChars, keepRecent, summaryMaxChars }, ctx);
        await next();
    };
};
function wrapModelWithCompression(model, cfg, ctx) {
    const origGenerate = model.generate.bind(model);
    return {
        ...model,
        async generate(messages, genOpts) {
            try {
                // Only compress when not already summarizing and context seems large
                if (!ctx.state.__compressing && approxChars(messages) > cfg.maxChars) {
                    ctx.log.info?.('[context-compressor] compressing conversation context');
                    ctx.state.__compressing = true;
                    try {
                        const compressed = await compressMessages(messages, cfg, ctx, origGenerate);
                        messages = compressed;
                    }
                    finally {
                        delete ctx.state.__compressing;
                    }
                }
            }
            catch (e) {
                ctx.log.warn?.('[context-compressor] failed to compress; proceeding uncompressed', e);
            }
            return await origGenerate(messages, genOpts);
        }
    };
}
function approxChars(messages) {
    let n = 0;
    for (const m of messages) {
        const c = m.content;
        if (typeof c === 'string')
            n += c.length;
        else if (Array.isArray(c))
            n += JSON.stringify(c).length;
    }
    return n;
}
async function compressMessages(messages, cfg, ctx, gen) {
    if (messages.length <= cfg.keepRecent + 1)
        return messages;
    const cut = Math.max(1, messages.length - cfg.keepRecent);
    const head = messages.slice(0, cut);
    const tail = messages.slice(cut);
    // Build a compression prompt
    const headText = sliceAndFlatten(head, cfg.summaryMaxChars * 5);
    const prompt = [
        { role: 'system', content: 'You are a compression assistant. Summarize the following conversation and tool outputs into a compact bullet list of established facts and extracted citations (URLs). Keep it under the specified character budget. Do not invent facts.' },
        { role: 'user', content: `Character budget: ${cfg.summaryMaxChars}. Include a section "Citations:" listing unique URLs.\n\nConversation to compress:\n${headText}` },
    ];
    const res = await gen(prompt, { toolChoice: 'none', signal: ctx.signal });
    const summary = String(res?.message?.content ?? '').slice(0, cfg.summaryMaxChars);
    const summaryMsg = { role: 'assistant', content: `[Summary of earlier turns]\n${summary}` };
    return [messages[0], summaryMsg, ...tail];
}
function sliceAndFlatten(msgs, max) {
    const parts = [];
    for (const m of msgs) {
        const role = m.role;
        const c = m.content;
        let text = '';
        if (typeof c === 'string')
            text = c;
        else if (Array.isArray(c))
            text = JSON.stringify(c);
        else
            text = String(c ?? '');
        parts.push(`--- ${role} ---\n${text}`);
        const joined = parts.join('\n');
        if (joined.length > max)
            return joined.slice(0, max);
    }
    return parts.join('\n');
}
