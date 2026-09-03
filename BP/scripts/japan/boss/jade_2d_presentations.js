import { presentJadeAbility2D as presentJadeAbility2DImpl } from "./jade_2d_presentations_impl.js";
import { presentTsukikageAbility2D } from "./tsukikage_2d_presentations.js";
import { presentOniAbility2D } from "./oni_2d_presentations.js";
import { presentSeiryuAbility2D } from "./seiryu_2d_presentations.js";
import { presentKuroganeAbility2D } from "./kurogane_2d_presentations.js";

export function presentJadeAbility2D(context, ability, plan) {
  if (presentJadeAbility2DImpl(context, ability, plan)) return true;
  if (presentTsukikageAbility2D(context, ability, plan)) return true;
  if (presentOniAbility2D(context, ability, plan)) return true;
  if (presentSeiryuAbility2D(context, ability, plan)) return true;
  return presentKuroganeAbility2D(context, ability, plan);
}
