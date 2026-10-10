# Devilization — Game Design

A first-person action game that runs in the web browser. You are a low-ranking demon in hell. Complete missions for the archdemons who rule each plane, rise through the ranks, descend through the ten planes of hell, and defeat the general of the angel army to become **Demon Lord**.

## Core decisions

| Area | Decision |
|---|---|
| Platform | Web browser on computers (Chrome, Edge, Safari), keyboard and mouse or trackpad. |
| Tech | Three.js + Vite + TypeScript. Proven parts are copied from Evil One and adapted. |
| Camera | First person. You see your clawed hands and your weapon. |
| Art style | Blocky, Minecraft-like, with models built from code (no external art). The world is solid: no digging or building. |
| Structure | Ten planes of hell. Each plane is its own open map with a hub (the lair of that plane's ruler), missions, and one treasure chest. |
| Enemies | Angels, plus traitor demons as some assassination targets. |
| Companion | A named demon-dog that follows you, cannot be hurt, and levels up with you. |
| Progression | Level 1–50 from XP (unlocks powers). Rank from missions (unlocks planes). |
| Goal | Reach level 50, descend to the 10th plane, and defeat the angel general. That makes you Demon Lord. |
| After the ending | The game continues with endless generated missions. |
| Death | Respawn at the current plane's hub. The current mission fails. You keep your gold, XP and items. |
| Travel home | From the pause menu, return to the current plane's lair at any time, unless a mission is running or something is fighting you. |
| Gold from angels | Every angel drops 10 gold. |
| Hazards | You're a hell demon: lava and fire can't hurt you (or your dog). Lava is thick, so wading through it is slow, and geysers throw you into the air. Only the angels' attacks do damage. |
| Travel | Go back to any unlocked plane at any time. |
| Save | Saved in the browser, so you can close the tab and come back later. |
| Length | 3–5 hours to beat the general (about 20–30 minutes per plane). |
| Audio | Synthesized sound effects and procedural music, as in Evil One. |
| Hosting | GitHub repo `devilization`, deployed to GitHub Pages on every push to `main`. |

## Game flow

1. **Title screen:** "Devilization", with New Game and Continue.
2. **Name your demon and your dog.**
3. **Intro:** a short text scene. You crawl out of the pits as a lowly Imp on the first plane, and the war against the angels is raging.
4. **Plane hub:** the ruler's lair. Take missions, get promoted, travel between planes.
5. **Missions:** assassinations, retrievals, and battles on the war front.
6. **Promotion:** finishing a plane's main missions earns the next rank, which opens the next plane down.
7. **10th plane:** opens once you hold the 9th rank **and** are level 50. Fight through the angels' war camp to the general.
8. **Ending:** you are crowned Demon Lord. Then endless missions continue across all planes.

## Ranks

Ranks are promotions from the plane rulers. Each rank opens the next plane.

| Rank | Earned by | Opens |
|---|---|---|
| 1. Imp | Start | Plane 1 |
| 2. Fiend | Plane 1's main missions | Plane 2 |
| 3. Hellguard | Plane 2's main missions | Plane 3 |
| 4. Pit Captain | Plane 3's main missions | Plane 4 |
| 5. Hellknight | Plane 4's main missions | Plane 5 |
| 6. Warlord | Plane 5's main missions | Plane 6 |
| 7. Archfiend | Plane 6's main missions | Plane 7 |
| 8. Duke of Hell | Plane 7's main missions | Plane 8 |
| 9. Prince of Hell | Plane 8's and 9's main missions | Plane 10 (also needs level 50) |
| 10. **Demon Lord** | Defeating the angel general | — |

## Levels and powers

XP comes from kills and missions. Each level raises health and damage and fully heals you. Max level is 50.

| Level | Unlocks |
|---|---|
| 1 | Spiked ball on a chain (starting weapon) |
| 10 | **Fire breath:** hold to breathe a cone of fire that sets enemies burning |
| 15 | **Ground spikes:** spikes burst from the ground at the spot you aim at and impale anyone standing there |
| 30 | **Change size:** grow larger or shrink smaller |
| 40 | **Flight** |
| 50 | **Natural armor:** permanent armor that adds to whatever you wear |

Recommended levels: about 5 levels per plane (plane 1 at level 1, plane 5 at about 20, plane 9 at about 40–45), with plane 10 locked until level 50.

### Size change (level 30)

- **Large:** more damage and health, slower, easy for enemies to spot. Stomps small enemies, smashes certain walls and gates, lifts heavy objects.
- **Small:** fast and hard to spot (good for assassinations), fits through cracks and small tunnels, but weaker.
- Some missions and many treasure chests need you to be tiny or huge.

## Missions

Each plane has a few **main missions** (needed for promotion) and repeatable **side missions** for gold and XP.

- **Assassination:** kill an angel officer, priest or spy hiding in hell, or a demon who betrayed your boss. Optional stealth: sneak up for an instant kill from behind (bonus reward), or go in loud and fight the target and their guards.
- **Retrieval:** recover a stolen relic, steal angel war plans, or bring back an item for your boss.
- **War front:** fight alongside demon troops in battles against the angel army.

## Combat

- **Weapons:** lots of variety, including melee (spiked flail, swords, axes, spears, hammers, scythes) and ranged (bows, thrown spears). Each type handles differently.
- **Fire breath** (level 10) and **ground spikes** (level 15) use a cooldown or energy bar.
- **Hit feedback:** enemies flash and get knocked back, and the screen shakes.

## Your demon-dog

- Has horns on its head. Attacks: **bite**, **horn charge**, **fire breath**.
- Named by the player at the start.
- Cannot be hurt.
- Levels up with you: its damage grows, and new attacks unlock as you level.

## Equipment and gold

- **Gold** comes from dead enemies and from one **treasure chest** hidden on each plane.
- **Weapons** come from dead enemies (take their weapon) or from the **weaponsmith**.
- **Armor** comes from the **armorer**.
- Open the **armory** (weaponsmith and armorer) from the pause menu.
- Gear is **mundane** or **enchanted**. Enchanted gear glows and has one special effect, for example fire damage, life-steal, faster swings, or resistance to holy light.

## Angels

Angels get tougher on each plane down.

- **Footsoldiers:** sword and shield.
- **Archers:** fire arrows of holy light from range.
- **Knights:** heavily armored.
- **Priests:** heal and shield other angels.
- **Seraphs:** fly and dive at you.
- **Officers:** stronger named angels, often assassination targets.

### Final boss: the angel general (plane 10)

A general of the angel army, fought at the end of the angels' war camp. When the general is down to half health, they summon **10 angels** to fight for them.

## The ten planes

Each plane has its own look. Plane 1 is the one you described; the others are working ideas.

1. **Lava plains:** an open plain with rivers of lava and geysers of fire. Lava and fire burn angels but not demons.
2. **Ash wastes**
3. **Bone forest**
4. **Sulfur swamps**
5. **Obsidian city**
6. **Chain canyons**
7. **Frozen hell**
8. **Burning sky:** floating islands (flight unlocks around here)
9. **The Abyss**
10. **The angels' war camp:** a captured, holy-lit fortress in the deepest plane

## Controls (keyboard and mouse or trackpad, defaults)

| Action | Input |
|---|---|
| Move | W A S D |
| Look | Mouse or trackpad (the pointer locks when you click into the game) |
| Attack | Click or `J` |
| Fire breath (hold) | `F` |
| Ground spikes | `R` (at the spot you're looking at) |
| Jump / fly | `Space` (double-tap to fly) |
| Sneak | `C` |
| Sprint | `Shift` |
| Shrink / grow | `Z` / `X` |
| Interact / pick up weapon | `E` |
| Map | `M` |
| Pause (Armory, Options) | `Esc` |

## Build milestones

1. ✅ **Core feel:** first-person camera, plane 1 terrain (lava rivers, fire geysers), spiked-flail combat against chained training angels, and the dog following and attacking (bite and horn charge).
2. ✅ **Hero and HUD:** name entry (demon and dog), health, hellfire, XP, gold, leveling, saving, fire breath and ground spikes; the dog's horn charge (level 5) and fire breath (level 10).
3. ✅ **First plane playable:** angel types (footsoldier, archer, priest, captain), Malphas's lair, three main missions (one of each type) and repeatable side missions, imp allies, stealth and silent kills, weapon drops (sword, spear, axe), the treasure chest on the geyser pillar, death and respawn, saving, and returning to the lair from the pause menu.
4. ✅ **Armory and gear:** the armory in the pause menu (weaponsmith, armorer, selling), eight weapons including the longbow and javelins, three kinds of armor, three weapon and four armor enchantments, and natural armor at level 50.
5. **Planes 2–9:** themes, ranks, travel between planes, size change and flight, size puzzles.
6. **Plane 10 and the ending:** the general, Demon Lord ending, endless missions.
7. **Polish:** music, sound, balancing, title screen, GitHub Pages deploy.

## Open questions (defaults are used until decided)

- Names: the demon's boss on each plane, the angel general, and rank titles (above are placeholders).
- XP numbers: training angels give 10 XP, real angels 15–60, Vargash 100, main missions 150, side missions 40 + 8 per level; the full climb to level 50 takes about 61,000 XP. Needs balancing across all ten planes.
- Names: Malphas (ruler of the First Plane), Vargash the Traitor, angel captains (Auriel and others) are placeholders.
- Seraphs (flying angels) and knights are planned for deeper planes.
- Do demon troops fight alongside you outside war-front missions? (default: no; just you and the dog)
- Should geysers launch you into the air? (default: yes, with no damage; they can carry you up onto high ledges)
- Should lava slow you down? (default: yes, to about half speed)
