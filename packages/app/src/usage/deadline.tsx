import { useEffect, useState } from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { subscribeToRelativeTimeTick } from "@/utils/relative-time-ticker";
import { formatUsageDeadline } from "./format";

/** Shares the app clock; only this label re-renders as a reset approaches. */
export function UsageDeadline({
  at,
  kind = "reset",
  retained = false,
  prefix = "",
  style,
}: {
  at: string | null | undefined;
  kind?: "reset" | "runOut";
  retained?: boolean;
  prefix?: string;
  style: StyleProp<TextStyle>;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(() => formatUsageDeadline(at, kind, t, retained));
  useEffect(() => {
    const update = () => setLabel(formatUsageDeadline(at, kind, t, retained));
    update();
    if (!at || !Number.isFinite(new Date(at).getTime()) || new Date(at).getTime() <= Date.now())
      return;
    return subscribeToRelativeTimeTick("minute", update);
  }, [at, kind, retained, t]);
  return label ? (
    <Text style={style}>
      {prefix}
      {label}
    </Text>
  ) : null;
}
