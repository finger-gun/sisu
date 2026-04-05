{
  "changesets": [
    {
      "releases": [
        {
          "name": "@sisu-ai/discovery",
          "type": "patch"
        }
      ],
      "summary": "Refresh generated discovery metadata for catalog and install recipes.\n\nThis publishes updated `src/generated/catalog.json` and `src/generated/recipes.json` so consumers get the latest package versions and capability definitions at runtime.",
      "id": "quiet-crabs-exist"
    }
  ],
  "releases": [
    {
      "name": "@sisu-ai/discovery",
      "type": "patch",
      "oldVersion": "0.2.0",
      "changesets": [
        "quiet-crabs-exist"
      ],
      "newVersion": "0.2.1"
    },
    {
      "name": "@sisu-ai/cli",
      "type": "patch",
      "oldVersion": "0.6.0",
      "changesets": [],
      "newVersion": "0.6.1"
    }
  ]
}