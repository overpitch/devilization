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
| Attack: swing, shoot or throw (click again during a swing to chain the combo) | Click or `J` |
| Breathe fire (from level 10) | Hold `F` |
| Ground spikes (from level 15) | Hold `R` to aim, let go to strike |
| Talk, take, open | `E` |
| Sneak (kill unaware enemies from behind with a click) | Hold `C` |
| Shrink / grow (from level 30) | `Z` / `X` |
| Take off or land (from level 40) | Tap `Space` twice; hold `Space` to climb, `C` to sink |
| Switch weapon | `1`–`4`, or `Q` for the next one |
| Jump | `Space` |
| Sprint | `Shift` |
| Pause (Armory, Options, Return to the lair) | `Esc` |

### With a controller

Any standard controller works (Xbox, PlayStation, and others), including **Microsoft Edge on Xbox**.

| Action | Button |
|---|---|
| Move / look | Left stick / right stick |
| Attack | RT |
| Breathe fire | Hold LT |
| Ground spikes | Hold RB to aim, let go to strike |
| Jump; take off or land | A; A twice (hold A to climb) |
| Sneak; sink while flying | Hold B |
| Talk, take, open | X |
| Switch weapon | Y or D-pad up |
| Shrink / grow | D-pad left / right |
| Sprint | LB or click the left stick |
| Pause | ☰ Menu |

In menus, the D-pad or left stick moves the highlight, A presses and B goes back.

**On Xbox:** open the game in Microsoft Edge, then hold the ☰ Menu button for a second to switch the controller from moving a cursor to game controls. The game starts on Low graphics there, and B won't take you off the page.

## What's in so far

### Phase 8

- **Controllers:** play the whole game with a controller: moving, looking (with a curve for fine aim), every attack and power, and rumble when you land blows or get hurt.
- **Menus by controller:** the D-pad or left stick moves a highlight through every screen (title, naming, intro, pause, options, armory, rulers, the Hellgate, death and the ending); A presses, B goes back, and left/right adjusts sliders and switches.
- **Prompts and power slots** show controller buttons (X, RT, LT…) while you're using one.
- **Xbox (Microsoft Edge):** a tip on the title screen explains how to switch the controller to game controls; B (which Edge treats as Back) no longer leaves the game; Low graphics by default and a lower render resolution so it runs smoothly. `?xbox` pretends to be an Xbox for testing.

### Phase 7

- **The Angels' War Camp** (the Tenth Plane): a white stone fortress with battlements, corner towers and a gate, under a sky lit gold by heaven. The Hellgate opens on it once you've finished the Abyss's missions and reached level 50.
- **The Morningstar** sits on the throne there and gives the last mission, **The Last Battle**: storm the gate, get past knights, priests, footsoldiers, archers on the walls and seraphs overhead, and kill **Archangel Seraphiel**, general of the heavenly host.
- **The general:** a giant with six wings and a flaming sword. Sword blows up close; from a distance, a leap that lands with a shockwave, or a fan of five bolts of light. At half health it calls down **ten angels** in columns of light. Below a quarter health it fights faster. Its health bar sits at the top of the screen.
- **The ending:** the general's death makes you **Demon Lord**, with an ending that names you and your hellhound and shows your level, angels slain and time in hell. Then keep playing or return to the title.
- **Endless missions:** a new side mission, **Heaven's Counterattack** (hold an outpost with six imps against three waves), joins the others. Every ruler keeps offering two side missions at fresh spots forever, and their rewards grow with your level.
- The Tenth Plane's treasure sits on top of a tower that only wings can reach.

### Phase 6

- **Change size** (level 30): Z shrinks, X grows. **Tiny** is fast and nearly invisible to angels and fits through cracks, but hits weakly and gets hurt more. **Huge** hits harder and further, takes less damage and climbs 2-block ledges, but is slower and easy to spot, and smashes rubble by walking into it.
- **Flight** (level 40): tap Space twice to take off or land; hold Space to climb and C to sink. Wings beat at the edges of the screen.
- **New angels:** **knights** hold up shields that stop more than half of any blow from the front, and **seraphs** fly over everything and dive down to strike (only bows, javelins, fire and spikes reach them up there).
- **Four more planes:**
  - **The Chain Canyons** (suggested level 25): rust-red canyons with lava below and great chains strung between iron posts. Ruled by **Furcas**. The treasure is walled in behind a crack only a tiny demon fits through.
  - **Frozen Hell** (level 30): snow, ice crystals, black freezing lakes, and frost geysers. Ruled by **Belial**. The treasure is behind boulders only a huge demon can smash.
  - **The Burning Sky** (level 35): islands in a sea of fire joined by land bridges. Ruled by **Phenex**. The treasure sits on a spire only wings can reach.
  - **The Abyss** (level 40): darkness, purple crystals and a river of void. Ruled by **Leviathan**. The treasure is behind another crack.
- Finishing the Abyss opens the way to the angels' war camp (the Tenth Plane) once you reach level 50, which comes in phase 7.
- **Balance:** angels on each plane now roughly match how strong you are at its suggested level.

### Phase 5

- **The Hellgate** stands beside every ruler's lair. Press E at it to travel to any plane your rank has opened, deeper or back up.
- **Promotions:** finish a plane's three main missions and its ruler raises your rank, which opens the next plane: Imp → Fiend → Hellguard → Pit Captain → Hellknight → Warlord.
- **Four new planes,** each with its own ground, sky, liquid, drifting motes, scenery, ruler, three main missions, angel camp, watchpost and treasure chest on a geyser pillar:
  - **The Ash Wastes** (suggested level 5): grey dunes under falling ash, ruled by **Bael**.
  - **The Bone Forest** (level 10): a forest of bone trees and a river of blood, ruled by **Morax the Bone King**.
  - **The Sulfur Swamps** (level 15): acid rivers and pools, sulfur crystals and vents, ruled by **Vepar**.
  - **The Obsidian City** (level 20): a grid of obsidian towers and lava canals, ruled by **Asmodar the Tyrant**.
- **Angels get stronger** deeper down (more health, harder hits, more XP). Gold stays at 10 per angel everywhere. Missions and chests pay more on deeper planes.
- Your progress on every plane is saved, and you're back on the plane you left when you continue.

### Phase 4

- **The Armory** (pause menu): a weaponsmith, an armorer, and *Your gear*, where you sell what you carry. Enchanted stock changes after every mission you finish.
- **New weapons:** the Brimstone Hammer (very slow; its overhead blow sends a shockwave through everyone nearby), the Reaper's Scythe (huge sweeps), the Longbow (burning arrows) and Hell Javelins (heavy thrown spears; another is always at hand). The axe is now the Hellforged Axe.
- **Armor:** Leather Harness (12%), Bone Mail (20%) and Obsidian Plate (30%) stop a share of the damage you take. It shows as bracers on your arms. Buying new armor trades in the old.
- **Enchantments** (gear glows in the enchantment's color):
  - Weapons: *of Flame* (sets angels burning), *of Thirst* (heals you by a sixth of the damage you deal), *of Haste* (a third faster).
  - Armor: *Holy Ward* (arrows and bolts do 40% less), *Thorns* (angels that hit you up close get hurt), *Mending* (heal sooner and twice as fast), *Swiftness* (move 15% faster).
- **Drops:** archers sometimes drop longbows; captains sometimes drop enchanted spears; the treasure chest now holds an enchanted weapon.
- **Natural armor** at level 50: 15% less damage from everything, on top of worn armor.

### Phase 3

- **Malphas's lair:** you arrive (and return when banished) at the foot of Malphas's throne. Press E near him for missions.
- **Angels that fight back:** footsoldiers (sword and shield), archers (holy arrows), priests (heal other angels, throw bolts of light) and captains. Lava and geysers burn them; they steer around lava.
- **Main missions:** *Blood at the Bridge* (hold the western bridge with six imps against three waves), *The Stolen Crown* (take it back from the angels' camp across the eastern river), and *The Traitor of the Pits* (kill Vargash on the northwest mesa; unseen pays double). Finishing all three promotes you to **Fiend**.
- **Side missions:** two at a time, at random spots on the plain: cull a patrol, silence a captain (unseen pays double), or recover a soul gem. Repeatable.
- **Stealth:** angels on guard show a yellow **?** as they grow suspicious and a red **!** when they spot you. Hold C to sneak: slower, lower, and much harder to see. Walk up behind an unaware enemy and click for a silent kill. Loud kills alert everyone nearby; silent ones don't.
- **Weapons:** angels drop their weapons (footsoldiers sometimes drop swords, captains always drop spears, Vargash drops a Fine Hellforged Axe). Weapons come Notched, plain or Fine. Carry up to four; taking a fifth swaps it for the one in your hand. Each weapon has its own combo.
- **Gold:** every angel drops 10 gold. Vargash drops 30.
- **Treasure chest:** on top of a pillar south-east of the lair that's too tall to climb. Ride the geyser beside it. Inside: 150 gold and a Fine weapon.
- **Ambient patrols** roam the plain and come back a while after you wipe them out.
- **Death:** you return to the lair and the current mission fails; you keep your gold, XP and weapons.
- **Return to the lair:** from the pause menu, when no mission is running and nothing is fighting you.
- **Objective marker** on screen, and a prompt for anything you can use with E.

### Phase 2

- **Names:** name your demon and your hellhound, with a short intro.
- **Levels 1–50:** XP from kills; each level raises health, hellfire and damage, and fully heals you. Leveling up has its own fanfare and announces any new power.
- **Gold:** coins burst out of fallen angels and fly to you when you come near.
- **Hellfire:** an energy bar that fire breath and ground spikes use. It refills when you stop using it.
- **Fire breath (level 10):** hold F for a cone of flame. Angels keep burning for a moment afterwards.
- **Ground spikes (level 15):** hold R to aim a red square on the ground, let go to make obsidian spikes burst out and impale any angels there.
- **The dog grows with you:** it hits harder as you level up, learns its horn charge at level 5, and breathes fire at level 10.
- **Saving:** progress is saved in the browser (on level-up, when you pause or quit, and every 20 seconds). You keep everything when you die.
- **HUD:** name, rank, level, dog's name, health, hellfire, XP, gold, and power slots that show when each power unlocks.

### Phase 1

- **The first plane:** a blocky plain with rivers of lava, fire geysers, obsidian spires, dead trees and bones, ringed by cliffs. Basalt bridges cross the rivers.
- **Lava:** it can't hurt a demon, but wading through it is slow.
- **Geysers:** they rumble and smoke, then shoot a column of fire that throws you high into the air without hurting you. Angels caught in one get burned.
- **The spiked flail:** a side sweep (wide arc) chains into an overhead smash (more damage, narrower). The ball swings on its chain as you move and turn.
- **Your demon-dog:** follows you, and joins in on any angel you hit, with a bite and a horn charge. It can't be hurt.
- **The training ground:** three captured angels standing dazed, arms limp and heads bowed. They don't react or fight back, and they come back a few seconds after you destroy them.

## Debugging

- **`?test`** skips the title and plays without pointer lock.
- **`?stats`** shows frame rate, draw calls and triangles.
- **`?xbox`** behaves as if on an Xbox (controller tip, Low graphics, no pointer lock).
- **`?level=15`** starts you at level 15, to try out the powers. This changes your saved game.
- **`__game.setLevel(n)`** in the console jumps to a level.
- In the browser console, `__game` exposes the player, dog, angels, geysers and camera:
  - `__game.step(seconds)` advances the game at a fixed 60 fps, even in a background tab.
  - `__game.frozen = true` stops the loop, so `__game.look([x, y, z], [x, y, z])` can show the world from any point.

## Layout

| File | What it does |
|---|---|
| `src/main.ts` | Setup, game loop, menus, interacting, saving, death and respawn |
| `src/campaign.ts` | The current plane's ruler, missions, camp, watchpost, treasure chest, Hellgate, patrols, weapons on the ground, objectives |
| `src/fighter.ts` | Angels, the traitor and imps: models, awareness, AI, attacks, death |
| `src/projectiles.ts` | Holy arrows and bolts of light; your burning arrows and javelins |
| `src/weapons.ts` | Weapons, armor, enchantments, prices, and blocky weapon models |
| `src/armory.ts` | The armory's stock, buying and selling |
| `src/planes.ts` | Every plane as data: ground, sky, liquid, scenery, ruler, missions and where things are |
| `src/layout.ts` | Places that are the same on every plane: the lair, the spawn point, the Hellgate |
| `src/trainingAngel.ts` | Dazed training angels |
| `src/world.ts` | Builds any plane: block terrain, rivers and lakes, city blocks, scenery, sky, lighting; movement against blocks |
| `src/geysers.ts` | Fire geysers |
| `src/player.ts` | The demon: movement, jumping, lava, flail swings and hits, levels, hellfire, fire breath and spike aiming |
| `src/powers.ts` | Fire breath (shared with the dog) and ground spikes |
| `src/progression.ts` | XP curve, level stats, ranks, power unlock levels |
| `src/pickups.ts` | Gold coins |
| `src/save.ts` | Saved game |
| `src/viewmodel.ts` | First-person arms and weapons: the flail's swinging ball and chain, and swings for swords, spears and axes |
| `src/camera.ts` | First-person camera, head bob, screen shake |
| `src/dog.ts` | The demon-dog: following, biting, horn charge |
| `src/character.ts` | Blocky humanoid model (from Evil One) |
| `src/particles.ts` | Fire, sparks, dust and feathers |
| `src/floaters.ts` | Floating damage numbers |
| `src/audio.ts` | Synthesized sound effects and the low roar of the plains |
| `src/hud.ts` | Status bars, power slots, and the title, naming, intro, pause and death screens |
| `src/input.ts` | Keyboard, pointer-lock mouse and controllers |
| `src/menuNav.ts` | Driving the menus with a controller |
| `src/settings.ts` | Saved options |
