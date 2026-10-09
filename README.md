# Devilization

A blocky, first-person demon game that runs in the browser. You start as a lowly Imp in hell and rise to Demon Lord. See [GAME_DESIGN.md](GAME_DESIGN.md) for the full design.

## Run it locally

```bash
npm install
npm run dev
```

Then go to http://localhost:5173, choose **New Game**, name your demon and your hellhound, and click **Rise**. Next time, **Continue** picks up where you left off.

## Controls

| Action | Input |
|---|---|
| Move | W A S D |
| Look | Mouse or trackpad |
| Swing the flail (click again during a swing to chain a second swing) | Click or `J` |
| Breathe fire (from level 10) | Hold `F` |
| Ground spikes (from level 15) | Hold `R` to aim, let go to strike |
| Jump | `Space` |
| Sprint | `Shift` |
| Pause (and Options) | `Esc` |

## What's in so far

### Milestone 2

- **Names:** name your demon and your hellhound, with a short intro.
- **Levels 1–50:** XP from kills; each level raises health, hellfire and damage, and fully heals you. Leveling up has its own fanfare and announces any new power.
- **Gold:** coins burst out of fallen angels and fly to you when you come near.
- **Hellfire:** an energy bar that fire breath and ground spikes use. It refills when you stop using it.
- **Fire breath (level 10):** hold F for a cone of flame. Angels keep burning for a moment afterwards.
- **Ground spikes (level 15):** hold R to aim a red square on the ground, let go to make obsidian spikes burst out and impale any angels there.
- **The dog grows with you:** it hits harder as you level up, learns its horn charge at level 5, and breathes fire at level 10.
- **Saving:** progress is saved in the browser (on level-up, when you pause or quit, and every 20 seconds). You keep everything when you die.
- **HUD:** name, rank, level, dog's name, health, hellfire, XP, gold, and power slots that show when each power unlocks.

### Milestone 1

- **The first plane:** a blocky plain with rivers of lava, fire geysers, obsidian spires, dead trees and bones, ringed by cliffs. Basalt bridges cross the rivers.
- **Lava:** it can't hurt a demon, but wading through it is slow.
- **Geysers:** they rumble and smoke, then shoot a column of fire that throws you high into the air without hurting you. Angels caught in one get burned.
- **The spiked flail:** a side sweep (wide arc) chains into an overhead smash (more damage, narrower). The ball swings on its chain as you move and turn.
- **Your demon-dog:** follows you, and joins in on any angel you hit, with a bite and a horn charge. It can't be hurt.
- **The training ground:** three angels chained to posts. They don't fight back, and they come back a few seconds after you destroy them.

## Debugging

- **`?test`** skips the title and plays without pointer lock.
- **`?stats`** shows frame rate, draw calls and triangles.
- **`?level=15`** starts you at level 15, to try out the powers. This changes your saved game.
- **`__game.setLevel(n)`** in the console jumps to a level.
- In the browser console, `__game` exposes the player, dog, angels, geysers and camera:
  - `__game.step(seconds)` advances the game at a fixed 60 fps, even in a background tab.
  - `__game.frozen = true` stops the loop, so `__game.look([x, y, z], [x, y, z])` can show the world from any point.

## Layout

| File | What it does |
|---|---|
| `src/main.ts` | Setup, game loop, menus, death and respawn |
| `src/world.ts` | Block terrain, lava rivers and lakes, scenery, sky, lighting, movement against blocks |
| `src/geysers.ts` | Fire geysers |
| `src/player.ts` | The demon: movement, jumping, lava, flail swings and hits, levels, hellfire, fire breath and spike aiming |
| `src/powers.ts` | Fire breath (shared with the dog) and ground spikes |
| `src/progression.ts` | XP curve, level stats, ranks, power unlock levels |
| `src/pickups.ts` | Gold coins |
| `src/save.ts` | Saved game |
| `src/viewmodel.ts` | First-person arms and the flail, with a swinging ball and chain |
| `src/camera.ts` | First-person camera, head bob, screen shake |
| `src/dog.ts` | The demon-dog: following, biting, horn charge |
| `src/angel.ts` | Chained training angels |
| `src/character.ts` | Blocky humanoid model (from Evil One) |
| `src/particles.ts` | Fire, sparks, dust and feathers |
| `src/floaters.ts` | Floating damage numbers |
| `src/audio.ts` | Synthesized sound effects and the low roar of the plains |
| `src/hud.ts` | Status bars, power slots, and the title, naming, intro, pause and death screens |
| `src/input.ts` | Keyboard and pointer-lock mouse |
| `src/settings.ts` | Saved options |
