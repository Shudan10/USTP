# USTP — Ultimate Survival Texture Pack

A 128×128 Minecraft **Bedrock** resource pack that blends a natural, organic look with clean modern-architecture detailing. **Every block and every item** is retextured, and ships PBR maps for **Vibrant Visuals** and **RTX**: metalness / emissive / roughness / subsurface plus a heightmap for blocks, and MERS for items.

## Install

1. Download `USTP_128x.mcpack` from the [latest release](../../releases/latest) and double-click it. On lower-memory PCs, phones or consoles use `USTP_64x_Lite.mcpack` instead (same look at half resolution).
2. Settings → Global Resources → My Packs → activate **Ultimate Survival Texture Pack (USTP) 128x**.
3. Settings → Video → Graphics Mode → **Vibrant Visuals** (or **Ray Tracing** on an RTX-capable GPU) to see the PBR lighting.

## Troubleshooting

- **Crash when opening a world:** lower Render Distance (Settings → Video) to 32 chunks or less, and make sure only one big texture pack is active in Global Resources. If it still crashes, use the 64x Lite pack.

## What's in it

| Set | Count | How it's made |
| --- | --- | --- |
| Signature blocks | 114 | Hand-designed procedurally in `gen.js`: stone family, dirt/grass, woods, ores, storage blocks, quartz, concrete, glass, utility blocks |
| Everything else — blocks | ~1,200 | Remastered from vanilla to 128x by `remaster.js` |
| Items (inventory icons) | ~900 | Remastered from vanilla to 128x by `remaster.js` |
| Block entities | chests, beds, shulker boxes | Remastered to 8× resolution |

Animated textures (water, lava, fire, portals…) are kept at 64x per frame: every frame sits in the block atlas, so at 128x they alone doubled the pack's memory use.

The remaster upscales with Scale2x (keeps pixel-art shapes crisp and rounds diagonals), then paints over the pixel grid, adds relief lighting from a generated heightmap, fine natural grain, and a vibrant colour grade that leaves biome-tinted (greyscale) textures neutral. Items get crisp silhouettes with a rim light. Mojang's own Vibrant Visuals MERS maps are upscaled alongside, so emissive, metallic and subsurface areas stay exactly where vanilla puts them.

![Signature blocks](preview.png)
![Items](preview_items.png)
![Remastered blocks (sample)](preview_blocks.png)

## Building

Needs Node.js 22+ and Mojang's official sample resource pack (only the textures are used):

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/Mojang/bedrock-samples.git ../bedrock-samples
```

```bash
git -C ../bedrock-samples sparse-checkout set resource_pack/textures/blocks resource_pack/textures/items resource_pack/textures/entity/chest resource_pack/textures/entity/bed resource_pack/textures/entity/shulker
```

```bash
node gen.js && node remaster.js ../bedrock-samples/resource_pack && node pack.js
```

On Windows, if git complains about long paths, add `-c core.longpaths=true` to the clone.

- `gen.js` wipes and rebuilds `USTP/` with the hand-made set, manifest and pack icon. Palettes are in the `P` and `WOOD` objects.
- `remaster.js` fills in every other texture (it never overwrites a hand-made one). `--only=<substring>` limits it to matching paths, `--sheet=<file.png>` writes a contact sheet.
- `pack.js` zips `USTP/` into `USTP_128x.mcpack`; `node pack.js --lite` builds `USTP_64x_Lite.mcpack`, a half-resolution copy that installs as its own pack.

## Layout

| Path | What |
| --- | --- |
| `gen.js` | Procedural generator for the hand-made set |
| `remaster.js` | Vanilla → USTP remaster (Scale2x, styling, PBR) |
| `imageio.js` | Dependency-free PNG/TGA reading and writing |
| `pack.js` | Builds the `.mcpack` files (full and `--lite`) |
| `USTP/` | Built resource pack source |
| `preview*.png` | Contact sheets |
