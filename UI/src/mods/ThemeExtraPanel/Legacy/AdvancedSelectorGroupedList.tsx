// PRESERVED, NOT CURRENTLY USED — DO NOT DELETE.
//
// This was ThemeExtraPanel's original Advanced mode: every CSS declaration grouped into its own
// FoldoutItem by origin CSS selector (258 groups - :root, .style--bright-blue, .editor-main-screen_*,
// every individual component class...), so editing e.g. --accentColorNormal under
// .style--bright-blue looked distinct from editing it under :root.
//
// That distinction turned out to be misleading for how ExtraTheme actually works: overrides only
// ever apply globally, via an inline style on <html> (see RegisterThemePanel.tsx / SetOverride in
// ThemeExtraPanel.cs) - so editing any selector's copy of a variable has the exact same real-world
// effect as editing :root's. Only :root is genuinely overridable; grouping by selector implied a
// control that didn't exist. Replaced 2026-09-15 by a flat, ungrouped card per :root-overridable
// variable directly in ThemeExtraPanel.tsx's Advanced mode.
//
// Kept here, fully working but unimported, for a future rework that adds REAL per-selector-scoped
// overrides (injecting an actual scoped <style> rule keyed by (selector, name), instead of today's
// flat Dictionary<string,string> keyed by name alone - see that conversation for the fuller design
// sketch, including which live selectors currently shadow which :root variables, e.g.
// .editor-main-screen_* re-defining the accent colors in the Editor). Wire
// AdvancedSelectorGroupedList back into ThemeExtraPanel.tsx's Advanced tab if/when that lands,
// instead of rebuilding this from scratch.

import { useMemo, useState } from "react";
import { FoldoutItem } from "../../../../game-ui/common/foldout/foldout-item";
import { TintedIcon } from "../../../../game-ui/common/image/tinted-icon";
import { TypedListRenderer } from "../../../../game-ui/common/typed-renderer/typed-renderer";
import { CssDeclaration } from "../DeclarationRow/CssDeclarationTypes";
import { cssDeclarationRowComponents } from "../DeclarationRow/CssDeclarationRow";
import { matchesSearch } from "../../Helpers/search";
import { Masonry } from "../Masonry";
import styles from "../ThemeExtraPanel.module.scss";

// A search also matching the selector itself pulls in that whole group - e.g. typing
// "bright-blue" surfaces .style--bright-blue's declarations even though "bright-blue" isn't in
// any of their names.
export const matchesSelectorSearch = (search: string, declaration: CssDeclaration): boolean =>
    matchesSearch(search, declaration.name) || matchesSearch(search, declaration.selector);

export const AdvancedSelectorGroupedList = ({ declarations, search }: { declarations: CssDeclaration[]; search: string }) => {
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    // Tracks every group that has EVER been expanded, and never removes from it - a group's row
    // content only mounts once it's been opened at least once, then stays mounted (just visually
    // collapsed) so re-opening it later is free. 258 groups meant rendering every group's rows
    // eagerly on mode switch, most of which nobody ever opens, was a real source of lag.
    const [everExpandedGroups, setEverExpandedGroups] = useState<Set<string>>(new Set());

    const toggleGroup = (title: string) => {
        setExpandedGroups((prev) => {
            const next = new Set(prev);
            next.has(title) ? next.delete(title) : next.add(title);
            return next;
        });
        setEverExpandedGroups((prev) => (prev.has(title) ? prev : new Set(prev).add(title)));
    };

    const filtered = useMemo(
        () => declarations.filter((d) => search.length === 0 || matchesSelectorSearch(search, d)),
        [declarations, search]
    );

    const groups = useMemo(() => {
        const bySelector = new Map<string, CssDeclaration[]>();
        for (const d of filtered) {
            const list = bySelector.get(d.selector);
            if (list) list.push(d); else bySelector.set(d.selector, [d]);
        }
        return [...bySelector.entries()]
            .sort(([a], [b]) => (a === ":root" ? -1 : b === ":root" ? 1 : a.localeCompare(b)))
            .map(([selector, items]) => ({ title: selector, displayTitle: selector, items }));
    }, [filtered]);

    const masonryItems = useMemo(() => groups.map((group) => {
        const expanded = expandedGroups.has(group.title);
        const everExpanded = everExpandedGroups.has(group.title);
        return {
            key: group.title,
            node: (
                <FoldoutItem
                    className={styles.group}
                    expanded={expanded}
                    expandFromContent={false}
                    initialExpanded={false}
                    header={
                        <div className={styles.groupHeader} onClick={() => toggleGroup(group.title)}>
                            <span className={styles.groupTitle}>{group.displayTitle}</span>
                            <span className={styles.count}>{group.items.length}</span>
                            <TintedIcon
                                className={styles.groupToggle}
                                src={expanded ? "Media/Glyphs/ThickStrokeArrowDown.svg" : "Media/Glyphs/ThickStrokeArrowRight.svg"}
                            />
                        </div>
                    }
                >
                    {everExpanded && <TypedListRenderer components={cssDeclarationRowComponents} data={group.items} props={{}} />}
                </FoldoutItem>
            ),
        };
    }), [groups, expandedGroups, everExpandedGroups]);

    return <Masonry minColumnWidth={250} gap={12} items={masonryItems} />;
};
