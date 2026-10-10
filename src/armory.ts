import type { Player } from './player';
import {
  ARMOR_ENCHANTS,
  ARMORS,
  armorName,
  armorPrice,
  MAX_WEAPONS,
  randomWeaponEnchant,
  SELL_SHARE,
  SHOP_WEAPONS,
  WEAPON_ENCHANTS,
  WEAPONS,
  weaponName,
  weaponPower,
  weaponPrice,
  type Armor,
  type ArmorEnchant,
  type ArmorId,
  type Quality,
  type Weapon,
} from './weapons';

/**
 * The armory, opened from the pause menu: a weaponsmith, an armorer, and
 * your own gear to equip or sell. Enchanted stock changes after every
 * mission you finish.
 */

export type ArmoryTab = 'weapons' | 'armor' | 'gear' | 'potions' | 'imps';

/** Hellfire draughts you can carry. */
export const MAX_POTIONS = 5;
/** A draught heals this share of your health. */
export const POTION_HEAL = 0.5;
/** Imps you can have following you. */
export const MAX_IMPS = 5;

/** What the stands need besides the shopper: who pays, and the imps you have. */
export interface ShopContext {
  /** Whose gold pays (in split screen both players share Player 1's purse). */
  purse: { gold: number };
  /** Imps following you now. */
  imps: number;
  hireImp(): void;
  /** Deeper planes charge more for draughts and imps. */
  power: number;
}

export const potionPrice = (power: number) => Math.round(25 * power);
export const impPrice = (power: number) => Math.round(60 * power);

/** One row in the armory's list. */
export interface ArmoryRow {
  title: string;
  /** Enchanted gear is shown in its enchantment's color. */
  color?: number;
  lines: string[];
  button: string;
  /** Why the button can't be used right now (it's disabled). */
  blocked?: string;
  act: () => void;
}

const sellPrice = (price: number) => Math.round(price * SELL_SHARE);

export class Armory {
  private weapons: Weapon[] = [];
  private armors: Armor[] = [];

  constructor() {
    this.restock();
  }

  /** New enchanted goods: three weapons and two suits of armor. */
  restock() {
    this.weapons = [];
    for (const id of SHOP_WEAPONS) {
      this.weapons.push({ id, quality: 1 }, { id, quality: 2 });
    }
    const pick = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];
    for (let i = 0; i < 3; i++) this.weapons.push({ id: pick(SHOP_WEAPONS), quality: (1 + Math.floor(Math.random() * 2)) as Quality, enchant: randomWeaponEnchant() });
    this.armors = (Object.keys(ARMORS) as ArmorId[]).map((id) => ({ id }));
    const enchants = Object.keys(ARMOR_ENCHANTS) as ArmorEnchant[];
    for (let i = 0; i < 2; i++) this.armors.push({ id: pick(Object.keys(ARMORS) as ArmorId[]), enchant: pick(enchants) });
  }

  /** The rows for a tab. `changed` runs after anything is bought, sold or equipped. */
  rows(tab: ArmoryTab, player: Player, changed: (message: string) => void, shop: ShopContext): ArmoryRow[] {
    const purse = shop.purse;
    if (tab === 'potions') {
      const price = potionPrice(shop.power);
      return [
        {
          title: 'Hellfire Draught',
          lines: [
            `Heals half your health in one gulp. Drink with H (D-pad down on a controller).`,
            `You carry ${player.potions} of ${MAX_POTIONS}.`,
          ],
          button: `Buy · ${price} gold`,
          blocked: purse.gold < price ? 'Not enough gold' : player.potions >= MAX_POTIONS ? `You can carry ${MAX_POTIONS}` : undefined,
          act: () => {
            if (purse.gold < price || player.potions >= MAX_POTIONS) return;
            purse.gold -= price;
            player.potions++;
            changed('Bought a Hellfire Draught');
          },
        },
      ];
    }
    if (tab === 'imps') {
      const price = impPrice(shop.power);
      return [
        {
          title: 'Hire an imp',
          lines: [
            'A spear-carrying imp that follows you and fights any angel that fights you. It stays with you until it falls.',
            `Imps with you: ${shop.imps} of ${MAX_IMPS}.`,
          ],
          button: `Hire · ${price} gold`,
          blocked: purse.gold < price ? 'Not enough gold' : shop.imps >= MAX_IMPS ? `At most ${MAX_IMPS} imps follow you` : undefined,
          act: () => {
            if (purse.gold < price || shop.imps >= MAX_IMPS) return;
            purse.gold -= price;
            shop.hireImp();
            changed('An imp joins you');
          },
        },
      ];
    }
    if (tab === 'weapons') {
      return this.weapons.map((w) => {
        const price = weaponPrice(w);
        const full = player.weapons.length >= MAX_WEAPONS;
        return {
          title: weaponName(w),
          color: w.enchant ? WEAPON_ENCHANTS[w.enchant].color : undefined,
          lines: [
            `${WEAPONS[w.id].blurb}. Up to ${weaponPower(w)} damage.`,
            ...(w.enchant ? [WEAPON_ENCHANTS[w.enchant].effect] : []),
          ],
          button: `Buy · ${price} gold`,
          blocked: purse.gold < price ? 'Not enough gold' : full ? `You can carry ${MAX_WEAPONS}: sell one first` : undefined,
          act: () => {
            if (purse.gold < price || player.weapons.length >= MAX_WEAPONS) return;
            purse.gold -= price;
            player.takeWeapon({ ...w });
            if (w.enchant) this.weapons = this.weapons.filter((x) => x !== w); // enchanted goods are one of a kind
            changed(`Bought ${weaponName(w)}`);
          },
        };
      });
    }
    if (tab === 'armor') {
      const tradeIn = player.armor ? sellPrice(armorPrice(player.armor)) : 0;
      return this.armors.map((a) => {
        const price = Math.max(0, armorPrice(a) - tradeIn);
        const def = ARMORS[a.id];
        return {
          title: armorName(a),
          color: a.enchant ? ARMOR_ENCHANTS[a.enchant].color : undefined,
          lines: [
            `${def.blurb}. Stops ${Math.round(def.reduction * 100)}% of damage.`,
            ...(a.enchant ? [ARMOR_ENCHANTS[a.enchant].effect] : []),
            ...(player.armor ? [`Your ${armorName(player.armor)} is traded in for ${tradeIn} gold.`] : []),
          ],
          button: `Buy · ${price} gold`,
          blocked: purse.gold < price ? 'Not enough gold' : undefined,
          act: () => {
            if (purse.gold < price) return;
            purse.gold -= price;
            player.armor = { ...a };
            if (a.enchant) this.armors = this.armors.filter((x) => x !== a);
            changed(`Now wearing ${armorName(a)}`);
          },
        };
      });
    }
    // Your gear: equip or sell what you carry.
    const rows: ArmoryRow[] = player.weapons.map((w, i) => {
      const price = sellPrice(weaponPrice(w));
      const inHand = i === player.equipped;
      return {
        title: `${i + 1}. ${weaponName(w)}${inHand ? ' (in hand)' : ''}`,
        color: w.enchant ? WEAPON_ENCHANTS[w.enchant].color : undefined,
        lines: [`${WEAPONS[w.id].blurb}. Up to ${weaponPower(w)} damage.`, ...(w.enchant ? [WEAPON_ENCHANTS[w.enchant].effect] : [])],
        button: `Sell · ${price} gold`,
        blocked: player.weapons.length <= 1 ? 'You need at least one weapon' : undefined,
        act: () => {
          if (player.weapons.length <= 1) return;
          purse.gold += price;
          player.weapons.splice(i, 1);
          if (player.equipped >= i && player.equipped > 0) player.equipped--;
          changed(`Sold ${weaponName(w)}`);
        },
      };
    });
    if (player.armor) {
      const a = player.armor;
      const price = sellPrice(armorPrice(a));
      rows.push({
        title: `${armorName(a)} (worn)`,
        color: a.enchant ? ARMOR_ENCHANTS[a.enchant].color : undefined,
        lines: [`Stops ${Math.round(ARMORS[a.id].reduction * 100)}% of damage.`, ...(a.enchant ? [ARMOR_ENCHANTS[a.enchant].effect] : [])],
        button: `Sell · ${price} gold`,
        act: () => {
          purse.gold += price;
          player.armor = null;
          changed(`Sold ${armorName(a)}`);
        },
      });
    }
    return rows;
  }
}
