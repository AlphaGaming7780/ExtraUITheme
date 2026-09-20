// PRESERVED, NOT CURRENTLY USED — DO NOT DELETE. ThemeExtraPanel's original selector-grouped Advanced mode, kept for a future per-selector-scoped-override rework.

import { useMemo, useState } from "react";
import { FoldoutItem } from "../../../../game-ui/common/foldout/foldout-item";
import { TintedIcon } from "../../../../game-ui/common/image/tinted-icon";
import { TypedListRenderer } from "../../../../game-ui/common/typed-renderer/typed-renderer";
import { CssDeclaration } from "../DeclarationRow/CssDeclarationTypes";
import { cssDeclarationRowComponents } from "../DeclarationRow/CssDeclarationRow";
import { matchesSearch } from "../../Helpers/search";
import { Masonry } from "../Masonry";
import styles from "../ThemeExtraPanel.module.scss";

// A search matching the selector itself pulls in that whole group, e.g. "bright-blue" surfaces .style--bright-blue's declarations.
export const matchesSelectorSearch = (search: string, declaration: CssDeclaration): boolean =>
    matchesSearch(search, declaration.name) || matchesSearch(search, declaration.selector);

export const AdvancedSelectorGroupedList = ({ declarations, search }: { declarations: CssDeclaration[]; search: string }) => {
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    // Every group ever expanded - content mounts once and stays mounted, since eagerly rendering all 258 groups was laggy.
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
