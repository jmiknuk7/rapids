import { describe, expect, it } from "vitest";
import { getExamById } from "../content/registry";
import map from "../scripts/migration/dropped-flashcards-map.json";

/**
 * Item 4 of the Phase-1 sign-off (Jake, 2026-08-17): the claim that every
 * dropped hand-delivered flashcard decomposes into retained atomic cards is
 * VERIFIED, not trusted. Each mapping target must (a) exist in cards.ts and
 * (b) have a front containing the stated fragment — so a wrong ID that
 * happens to exist still fails.
 */
describe("dropped-flashcards audit (38 merged cards → atomic coverage)", () => {
  const ccaf = getExamById("cca-f")!;
  const byId = new Map(ccaf.cards.map((c) => [c.id, c]));

  it("maps all 38 dropped cards", () => {
    expect(map.dropped).toHaveLength(38);
    const ids = new Set(map.dropped.map((d) => d.droppedId));
    expect(ids.size).toBe(38);
  });

  it("every dropped card maps to ≥1 retained atomic card, verified by front content", () => {
    for (const d of map.dropped) {
      expect(d.targets.length, d.droppedId).toBeGreaterThan(0);
      for (const t of d.targets) {
        const card = byId.get(t.id);
        expect(card, `${d.droppedId} → ${t.id} missing from cards.ts`).toBeDefined();
        expect(card!.type, `${d.droppedId} → ${t.id}`).toBe("recall");
        expect(
          card!.front.toLowerCase(),
          `${d.droppedId} → ${t.id}: front does not contain "${t.frontContains}"`,
        ).toContain(t.frontContains.toLowerCase());
      }
    }
  });
});
