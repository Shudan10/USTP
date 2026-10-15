# USTP — Ultimate Survival Texture Pack

A 128×128 Minecraft **Bedrock** resource pack that blends a natural, organic look with clean modern-architecture detailing. Every block ships with PBR maps (metalness/emissive/roughness + heightmap) for **RTX** and **Vibrant Visuals**.

![Preview of all textures](preview.png)

## Install

1. Download `USTP_128x.mcpack` and double-click it — Minecraft imports it automatically.
2. Settings → Global Resources → activate the pack.
3. Turn on Vibrant Visuals (Video settings) or RTX (supported GPU required) to see the PBR lighting.

## What's covered (114 textures)

Stone, andesite/diorite/granite (raw + polished), deepslate, dirt, grass, sand, gravel, cobblestone (+ mossy), clay, snow, obsidian, bedrock, farmland, the sandstone family, oak/spruce/birch/dark oak logs, planks and leaves, bricks, stone bricks (mossy, cracked, chiseled), smooth stone, quartz, glass, all 16 concrete colors, every overworld ore (stone + deepslate), storage blocks, glowstone, redstone lamp, crafting table, furnace and bookshelf.

Anything not listed falls back to vanilla.

## Rebuilding

All textures are generated procedurally — no external dependencies, just Node.js 22+:

```bash
node gen.js
```

This regenerates `USTP/` and `preview.png`. Palettes live in the `P` and `WOOD` objects at the top of `gen.js`; block recipes are in the "build" section. To repackage, zip the *contents* of `USTP/` and rename the `.zip` to `.mcpack`.

## Layout

| Path | What |
| --- | --- |
| `gen.js` | Procedural generator (noise, PNG/TGA writers, block recipes) |
| `USTP/` | The resource pack source (`manifest.json`, `pack_icon.png`, `textures/blocks/…`) |
| `USTP_128x.mcpack` | Ready-to-install build |
| `preview.png` | Contact sheet of every texture |
