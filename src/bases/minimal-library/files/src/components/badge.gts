import type { TOC } from "@ember/component/template-only";

export interface BadgeSignature {
  Element: HTMLSpanElement;
  Blocks: {
    default: [];
  };
}

/**
 * Exported template-only components need an explicit type annotation
 * (`TOC<...>`): declarations are emitted with isolated declarations, which
 * requires every exported value to have an explicit type.
 */
export const Badge: TOC<BadgeSignature> = <template>
  <span class="badge" ...attributes>{{yield}}</span>
</template>;
