import classNames from "classnames";
import { useLocalization } from "cs2/l10n";
import { trigger } from "cs2/api";
import { Button } from "../../../../game-ui/common/input/button/button";
import { DialogButtonSCSS } from "../../../../game-ui/common/input/button/themes/dialog-button.module.scss";
import { TintedIcon } from "../../../../game-ui/common/image/tinted-icon";
import { ExtraUIThemeDialog } from "./ExtraUIThemeDialog";
import { isWarning, ThemeIssue, ThemeIssueKind } from "../ThemeTypes";
import styles from "./ThemeIssuesReport.module.scss";

const kindOrder = [ThemeIssueKind.Missing, ThemeIssueKind.BrokenReference, ThemeIssueKind.KindChanged, ThemeIssueKind.InvalidValue, ThemeIssueKind.Redundant];

const kindDefaults: Record<ThemeIssueKind, [string, string]> = {
    [ThemeIssueKind.Missing]: ["No longer in the game", "The game doesn't declare these variables anymore - they have no effect."],
    [ThemeIssueKind.InvalidValue]: ["Unrecognized value", "These values aren't a color, size or number the game can use."],
    [ThemeIssueKind.KindChanged]: ["Type changed", "The game now expects another kind of value here (e.g. a size instead of a color)."],
    [ThemeIssueKind.BrokenReference]: ["Broken reference", "These values point to a variable that no longer exists."],
    [ThemeIssueKind.Redundant]: ["Same as the game", "Info only: these values equal the game default and change nothing."],
};

// Shared by the import report and the panel's issues dialog - one block per kind, warnings first, the info-only Redundant last.
export const ThemeIssueList = ({ issues }: { issues: ThemeIssue[] }) => {
    const { translate } = useLocalization();
    return (
        <div className={styles.list}>
            {kindOrder.map((kind) => {
                const ofKind = issues.filter((i) => i.kind === kind);
                if (ofKind.length === 0) return null;
                const [title, desc] = kindDefaults[kind];
                const key = ThemeIssueKind[kind];
                return (
                    <div key={key} className={classNames(styles.group, kind === ThemeIssueKind.Redundant && styles.groupInfo)}>
                        <div className={styles.groupHeader}>
                            <TintedIcon className={styles.groupIcon} src={kind === ThemeIssueKind.Redundant ? "Media/Glyphs/Info.svg" : "Media/Glyphs/Warning.svg"} />
                            <span>{translate(`ExtraUITheme.Panel.IssueKind[${key}]`, title)}</span>
                            <span className={styles.groupCount}>{ofKind.length}</span>
                        </div>
                        <div className={styles.groupDesc}>{translate(`ExtraUITheme.Panel.IssueKindDesc[${key}]`, desc)}</div>
                        {ofKind.map((issue) => (
                            <div key={issue.name} className={styles.row}>
                                <span className={styles.rowName}>{issue.name}</span>
                                <span className={styles.rowValue}>{issue.themeValue}</span>
                                {issue.gameValue.length > 0 && kind !== ThemeIssueKind.Redundant && (
                                    <span className={styles.rowGame}>
                                        {(translate("ExtraUITheme.Panel.IssueGameValue", "game: {value}") ?? "").replace("{value}", issue.gameValue)}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                );
            })}
        </div>
    );
};

export const countWarnings = (issues: ThemeIssue[]) => issues.filter(isWarning).length;

// Opened from the panel's banner: the active theme's report against the current game CSS, with a one-click clean up.
export const ThemeIssuesDialog = ({
    themeName,
    issues,
    isBuiltIn,
    onClose,
}: {
    themeName: string;
    issues: ThemeIssue[];
    isBuiltIn: boolean;
    onClose: () => void;
}) => {
    const { translate } = useLocalization();
    const warnings = countWarnings(issues);

    const cleanUp = () => {
        // C# removes every warning (never the info-only ones) through the undo history - Ctrl+Z brings them back.
        trigger("EUT", "RemoveThemeIssues");
        onClose();
    };

    return (
        <ExtraUIThemeDialog wide title={translate("ExtraUITheme.Panel.IssuesTitle", "Theme check")} onClose={onClose}
            buttons={
                <div className={styles.footer}>
                    <span className={styles.hint}>
                        {isBuiltIn
                            ? translate("ExtraUITheme.Panel.IssuesReadOnly", "Built-in theme: clone it to clean it up.")
                            : translate("ExtraUITheme.Panel.IssuesCleanUpDesc", "Clean up removes the flagged variables. Undo brings them back.")}
                    </span>
                    <div className={styles.buttons}>
                        <Button className={DialogButtonSCSS.button} onSelect={onClose}>{translate("ExtraUITheme.Panel.Close", "Close")}</Button>
                        <Button className={classNames(DialogButtonSCSS.button, DialogButtonSCSS.negative)} disabled={isBuiltIn || warnings === 0} onSelect={cleanUp}>
                            {translate("ExtraUITheme.Panel.IssuesCleanUp", "Clean up")}
                        </Button>
                    </div>
                </div>
            }>
            <div className={styles.summary}>
                <span>{(translate("ExtraUITheme.Panel.IssuesSummary", "{count} variable(s) of {name} don't match the current game anymore.") ?? "")
                    .replace("{count}", String(warnings)).replace("{name}", `"${themeName}"`)}</span>
            </div>
            <ThemeIssueList issues={issues} />
        </ExtraUIThemeDialog>
    );
};
