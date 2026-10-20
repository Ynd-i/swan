import { Alert } from "@/components/ui/alert";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useState, useCallback, useMemo, useRef, type RefObject } from "react";
import {
  View,
  Text,
  Pressable,
  type NativeSyntheticEvent,
  type PressableStateCallbackType,
  type TextInputKeyPressEventData,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useIsCompactFormFactor } from "@/constants/layout";
import { Check, ChevronRight, CircleHelp, Pencil, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import type { PendingPermission } from "@/types/shared";
import type { AgentPermissionResponse } from "@getpaseo/protocol/agent-types";
import { getIsElectronMac, isWeb } from "@/constants/platform";
import type { Theme } from "@/styles/theme";
import { EditingTextInput as TextInput } from "@/components/ui/text-input";
import type { EditingTextInputHandle } from "@/components/ui/text-input/types";
import { ScrollableCodeSurface } from "@/components/ui/scrollable-code-surface";
import { isImeComposingKeyboardEvent } from "@/utils/keyboard-ime";
import {
  areQuestionsAnswered,
  buildQuestionFormAnswers,
  isQuestionAnswered,
  parseQuestionFormQuestions,
  questionShowsTextInput,
  resolveDismissLabel,
  shouldSubmitEmptyOnDismiss,
  type QuestionFormQuestion,
  type QuestionOption,
} from "./question-form-card-core";

interface QuestionFormCardProps {
  permission: PendingPermission;
  onRespond: (response: AgentPermissionResponse) => void;
  isResponding: boolean;
  responseError: string | null;
}

const IS_WEB = isWeb;
// Native previews are uncapped: inside the option's Pressable, Android never hands a
// drag to the preview's nested scroll, so lines past a cap would be unreachable.
const OPTION_PREVIEW_MAX_HEIGHT = IS_WEB ? 240 : undefined;
// The Mac card only renders in Electron: the textarea grows with the answer up to its
// maxHeight, then scrolls.
const MAC_GROWING_INPUT_STYLE = { fieldSizing: "content" };

type QuestionInputKeyPressEvent = NativeSyntheticEvent<
  TextInputKeyPressEventData & { shiftKey?: boolean; isComposing?: boolean; keyCode?: number }
>;

function getQuestionInputPlaceholder({
  question,
  answerPlaceholder,
  otherPlaceholder,
}: {
  question: QuestionFormQuestion;
  answerPlaceholder: string;
  otherPlaceholder: string;
}): string {
  return (
    question.placeholder ?? (question.options.length === 0 ? answerPlaceholder : otherPlaceholder)
  );
}

function getOptionsGroupAccessibility(question: QuestionFormQuestion | undefined) {
  if (!question || question.multiSelect) return {};
  return {
    accessibilityRole: "radiogroup" as const,
    accessibilityLabel: question.question,
  };
}

interface QuestionOptionRowProps {
  qIndex: number;
  optIndex: number;
  option: QuestionOption;
  isSelected: boolean;
  multiSelect: boolean;
  isMacPresentation: boolean;
  isResponding: boolean;
  onToggle: (qIndex: number, optIndex: number, multiSelect: boolean) => void;
}

function QuestionOptionRow({
  qIndex,
  optIndex,
  option,
  isSelected,
  multiSelect,
  isMacPresentation,
  isResponding,
  onToggle,
}: QuestionOptionRowProps) {
  const { theme } = useUnistyles();

  const handlePress = useCallback(() => {
    onToggle(qIndex, optIndex, multiSelect);
  }, [onToggle, qIndex, optIndex, multiSelect]);

  const pressableStyle = useCallback(
    ({
      pressed,
      hovered,
      focused = false,
    }: PressableStateCallbackType & { hovered?: boolean; focused?: boolean }) => [
      isMacPresentation ? styles.macOptionItem : styles.optionItem,
      (Boolean(hovered) || focused || isSelected) && {
        backgroundColor: isMacPresentation
          ? styles.macOptionHighlight.backgroundColor
          : theme.colors.surface2,
      },
      pressed && styles.optionItemPressed,
    ],
    [isMacPresentation, isSelected, theme],
  );

  const optionLabelStyle = useMemo(
    () => [
      styles.optionLabel,
      { color: isSelected ? theme.colors.foreground : theme.colors.foregroundMuted },
    ],
    [isSelected, theme.colors.foreground, theme.colors.foregroundMuted],
  );
  const optionDescriptionStyle = useMemo(
    () => [styles.optionDescription, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );
  const accessibilityState = useMemo(() => ({ checked: isSelected }), [isSelected]);

  // Static left-side control: square for multi-select, circle for single-select.
  // Always rendered so toggling only swaps fill/border — the row never reflows.
  const controlStyle = useMemo(
    () => [
      styles.selectionControl,
      multiSelect ? styles.selectionControlCheckbox : styles.selectionControlRadio,
      {
        borderColor: isSelected ? theme.colors.accent : theme.colors.foregroundExtraMuted,
        backgroundColor: isSelected && multiSelect ? theme.colors.accent : "transparent",
      },
    ],
    [isSelected, multiSelect, theme.colors.accent, theme.colors.foregroundExtraMuted],
  );
  const radioDotStyle = useMemo(
    () => [styles.selectionRadioDot, { backgroundColor: theme.colors.accent }],
    [theme.colors.accent],
  );

  return (
    <Pressable
      style={pressableStyle}
      onPress={handlePress}
      disabled={isResponding}
      accessibilityRole={multiSelect ? "checkbox" : "radio"}
      accessibilityLabel={option.label}
      accessibilityState={accessibilityState}
      aria-checked={isSelected}
    >
      <View style={styles.optionItemContent}>
        {isMacPresentation && !multiSelect ? (
          <View style={styles.macOptionNumber}>
            <Text style={styles.macOptionNumberText}>{optIndex + 1}</Text>
          </View>
        ) : (
          <View style={controlStyle}>
            {isSelected && multiSelect ? (
              <Check size={12} color={theme.colors.accentForeground} />
            ) : null}
            {isSelected && !multiSelect ? <View style={radioDotStyle} /> : null}
          </View>
        )}
        <View style={styles.optionTextBlock}>
          <Text style={optionLabelStyle}>{option.label}</Text>
          {option.description ? (
            <Text style={optionDescriptionStyle}>{option.description}</Text>
          ) : null}
          {option.preview ? (
            // Shown for every option at once so they can be compared before picking.
            // Long lines wrap, as in Claude Code, since most previews are prose.
            <ScrollableCodeSurface
              tone="surface0"
              maxHeight={OPTION_PREVIEW_MAX_HEIGHT}
              horizontal={false}
              selectable={false}
              textStyle={styles.optionPreviewText}
              testID="question-form-option-preview"
            >
              {option.preview}
            </ScrollableCodeSurface>
          ) : null}
        </View>
        {isMacPresentation && isSelected && !multiSelect ? (
          <ChevronRight size={18} color={theme.colors.foregroundMuted} />
        ) : null}
      </View>
    </Pressable>
  );
}

interface QuestionNavButtonProps {
  index: number;
  total: number;
  header: string;
  isActive: boolean;
  isAnswered: boolean;
  isResponding: boolean;
  onSelect: (index: number) => void;
}

function QuestionNavButton({
  index,
  total,
  header,
  isActive,
  isAnswered,
  isResponding,
  onSelect,
}: QuestionNavButtonProps) {
  const { theme } = useUnistyles();
  const accessibilityState = useMemo(() => ({ selected: isActive }), [isActive]);
  const handlePress = useCallback(() => {
    onSelect(index);
  }, [index, onSelect]);
  const pressableStyle = useCallback(
    ({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => {
      return [
        styles.questionNavButton,
        {
          backgroundColor:
            isActive || Boolean(hovered) ? theme.colors.surface2 : theme.colors.surface1,
          borderColor: isActive ? theme.colors.foregroundMuted : theme.colors.border,
        },
        pressed && styles.optionItemPressed,
      ];
    },
    [
      isActive,
      theme.colors.border,
      theme.colors.foregroundMuted,
      theme.colors.surface1,
      theme.colors.surface2,
    ],
  );
  const textStyle = useMemo(
    () => [
      styles.questionNavText,
      { color: isActive ? theme.colors.foreground : theme.colors.foregroundMuted },
    ],
    [isActive, theme.colors.foreground, theme.colors.foregroundMuted],
  );

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityLabel={`Question ${index + 1} of ${total}`}
      accessibilityState={accessibilityState}
      aria-selected={isActive}
      testID={`question-form-question-nav-${index + 1}`}
      style={pressableStyle}
      onPress={handlePress}
      disabled={isResponding}
    >
      {isAnswered ? (
        <Check
          size={12}
          color={isActive ? theme.colors.foreground : theme.colors.foregroundMuted}
        />
      ) : null}
      <Text style={textStyle} numberOfLines={1}>
        {header}
      </Text>
    </Pressable>
  );
}

interface QuestionNavProps {
  questions: QuestionFormQuestion[];
  activeIndex: number;
  isAnswered: (qIndex: number) => boolean;
  isResponding: boolean;
  onSelect: (index: number) => void;
}

// Titled tabs (one per question header) with a check on answered ones. Hidden for
// a lone question — a single "1 of 1" tab carries no information.
function QuestionNav({
  questions,
  activeIndex,
  isAnswered,
  isResponding,
  onSelect,
}: QuestionNavProps) {
  if (questions.length <= 1) {
    return null;
  }
  return (
    <View
      style={styles.questionNav}
      testID="question-form-question-nav"
      accessibilityRole="tablist"
    >
      {questions.map((question, qIndex) => (
        <QuestionNavButton
          key={question.header}
          index={qIndex}
          total={questions.length}
          header={question.header}
          isActive={qIndex === activeIndex}
          isAnswered={isAnswered(qIndex)}
          isResponding={isResponding}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

interface QuestionOtherInputProps {
  qIndex: number;
  inputRef: RefObject<EditingTextInputHandle | null>;
  accessibilityLabel: string;
  value: string;
  placeholder: string;
  isResponding: boolean;
  isMacPresentation: boolean;
  onChange: (qIndex: number, text: string) => void;
  onSubmit: () => void;
}

function QuestionOtherInput({
  qIndex,
  inputRef,
  accessibilityLabel,
  value,
  placeholder,
  isResponding,
  isMacPresentation,
  onChange,
  onSubmit,
}: QuestionOtherInputProps) {
  const { theme } = useUnistyles();
  const [isFocused, setIsFocused] = useState(false);
  const handleChange = useCallback(
    (text: string) => {
      onChange(qIndex, text);
    },
    [onChange, qIndex],
  );
  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => setIsFocused(false), []);
  // The Mac field is a growing textarea: Enter submits, Shift+Enter adds a line.
  const handleMacKeyPress = useCallback(
    (event: QuestionInputKeyPressEvent) => {
      const { key, shiftKey } = event.nativeEvent;
      if (key !== "Enter" || shiftKey || isImeComposingKeyboardEvent(event.nativeEvent)) return;
      event.preventDefault();
      onSubmit();
    },
    [onSubmit],
  );
  const otherInputStyle = useMemo(
    () =>
      [
        styles.otherInput,
        {
          borderColor: value.length > 0 ? theme.colors.borderAccent : theme.colors.border,
          color: theme.colors.foreground,
          backgroundColor: theme.colors.surface2,
        },
        IS_WEB ? { outlineStyle: "none", outlineWidth: 0, outlineColor: "transparent" } : null,
      ] as const,
    [
      value.length,
      theme.colors.borderAccent,
      theme.colors.border,
      theme.colors.foreground,
      theme.colors.surface2,
    ],
  );
  const input = (
    <TextInput
      ref={inputRef}
      // @ts-expect-error - outlineStyle is web-only
      style={
        isMacPresentation
          ? [otherInputStyle, styles.macOtherInput, MAC_GROWING_INPUT_STYLE]
          : otherInputStyle
      }
      accessibilityLabel={accessibilityLabel}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.foregroundMuted}
      initialValue={value}
      onChangeText={handleChange}
      onSubmitEditing={onSubmit}
      onKeyPress={isMacPresentation ? handleMacKeyPress : undefined}
      onFocus={handleFocus}
      onBlur={handleBlur}
      multiline={isMacPresentation}
      rows={1}
      editable={!isResponding}
      blurOnSubmit={false}
    />
  );
  if (!isMacPresentation) return input;
  return (
    <View
      style={[styles.macOtherInputRow, isFocused && styles.macOtherInputRowFocused]}
      testID="question-form-other-input"
    >
      <Pencil size={18} color={theme.colors.foregroundMuted} />
      {input}
    </View>
  );
}

function QuestionFormHeader({
  theme,
  isMacPresentation,
  isResponding,
  dismissLabel,
  onDismiss,
}: {
  theme: Theme;
  isMacPresentation: boolean;
  isResponding: boolean;
  dismissLabel: string;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  if (!isMacPresentation) return null;
  return (
    <View style={styles.macTitleRow}>
      <View style={styles.macTitleContent}>
        <CircleHelp size={18} color={theme.colors.foregroundMuted} />
        <Text style={styles.macTitleText}>{t("message.question.title")}</Text>
      </View>
      <Pressable
        onPress={onDismiss}
        disabled={isResponding}
        accessibilityRole="button"
        accessibilityLabel={dismissLabel}
        style={styles.macCloseButton}
      >
        <X size={18} color={theme.colors.foregroundMuted} />
      </Pressable>
    </View>
  );
}

function QuestionFormActions({
  theme,
  isMacPresentation,
  isMobile,
  isResponding,
  respondingAction,
  dismissLabel,
  primaryDisabled,
  primaryActionLabel,
  isLastQuestion,
  onDismiss,
  onPrimaryAction,
}: {
  theme: Theme;
  isMacPresentation: boolean;
  isMobile: boolean;
  isResponding: boolean;
  respondingAction: "submit" | "dismiss" | null;
  dismissLabel: string;
  primaryDisabled: boolean;
  primaryActionLabel: string;
  isLastQuestion: boolean;
  onDismiss: () => void;
  onPrimaryAction: () => void;
}) {
  const { t } = useTranslation();
  const dismissButtonStyle = useCallback(
    ({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.actionButton,
      {
        backgroundColor: hovered ? theme.colors.surface2 : theme.colors.surface1,
        borderColor: theme.colors.borderAccent,
      },
      pressed && styles.optionItemPressed,
    ],
    [theme.colors.surface2, theme.colors.surface1, theme.colors.borderAccent],
  );
  const submitButtonStyle = useCallback(
    ({ pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.actionButton,
      {
        backgroundColor: theme.colors.accent,
        borderColor: theme.colors.accent,
        opacity: primaryDisabled ? 0.5 : 1,
      },
      pressed && !primaryDisabled ? styles.optionItemPressed : null,
    ],
    [primaryDisabled, theme.colors.accent],
  );
  const actionsContainerStyle = useMemo(
    () => [styles.actionsContainer, !isMobile && styles.actionsContainerDesktop],
    [isMobile],
  );
  const dismissActionTextStyle = useMemo(
    () => [styles.actionText, { color: theme.colors.foregroundMuted }],
    [theme.colors.foregroundMuted],
  );
  const submitActionTextColor = isMacPresentation
    ? styles.macSubmitText.color
    : theme.colors.accentForeground;
  const submitActionTextStyle = useMemo(
    () => [styles.actionText, { color: submitActionTextColor }],
    [submitActionTextColor],
  );
  const macSubmitButtonStyle = useMemo(
    () => [styles.macSubmitButton, primaryDisabled && styles.macActionButtonDisabled],
    [primaryDisabled],
  );
  const submitLabel =
    isMacPresentation && isLastQuestion ? t("message.question.send") : primaryActionLabel;

  return (
    <View style={[actionsContainerStyle, isMacPresentation && styles.macActionsContainer]}>
      <Pressable
        style={isMacPresentation ? styles.macDismissButton : dismissButtonStyle}
        onPress={onDismiss}
        disabled={isResponding}
        accessibilityRole="button"
        accessibilityLabel={dismissLabel}
        testID="question-form-dismiss"
      >
        {respondingAction === "dismiss" ? (
          <LoadingSpinner size="small" color={theme.colors.foregroundMuted} />
        ) : (
          <View style={styles.actionContent}>
            {isMacPresentation ? null : <X size={14} color={theme.colors.foregroundMuted} />}
            <Text style={dismissActionTextStyle}>{dismissLabel}</Text>
          </View>
        )}
      </Pressable>
      <Pressable
        style={isMacPresentation ? macSubmitButtonStyle : submitButtonStyle}
        onPress={onPrimaryAction}
        disabled={primaryDisabled}
        accessibilityRole="button"
        accessibilityLabel={submitLabel}
        testID="question-form-primary-action"
      >
        {respondingAction === "submit" ? (
          <LoadingSpinner size="small" color={theme.colors.accentForeground} />
        ) : (
          <View style={styles.actionContent}>
            {isMacPresentation ? null : <Check size={14} color={submitActionTextColor} />}
            <Text style={submitActionTextStyle}>{submitLabel}</Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

// oxlint-disable-next-line complexity -- upstream card plus the Mac presentation branches
export function QuestionFormCard({
  permission,
  onRespond,
  isResponding,
  responseError,
}: QuestionFormCardProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const isMobile = useIsCompactFormFactor();
  const isMacPresentation = getIsElectronMac();
  const questions = useMemo(
    () => parseQuestionFormQuestions(permission.request.input),
    [permission.request.input],
  );

  const [selections, setSelections] = useState<Record<number, Set<number>>>({});
  const [otherTexts, setOtherTexts] = useState<Record<number, string>>({});
  const otherInputRef = useRef<EditingTextInputHandle | null>(null);
  const [respondingAction, setRespondingAction] = useState<"submit" | "dismiss" | null>(null);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState(0);

  const toggleOption = useCallback(
    (qIndex: number, optIndex: number, multiSelect: boolean) => {
      const current = selections[qIndex] ?? new Set<number>();
      const next = new Set(current);
      if (multiSelect) {
        if (next.has(optIndex)) {
          next.delete(optIndex);
        } else {
          next.add(optIndex);
        }
      } else if (next.has(optIndex)) {
        next.clear();
      } else {
        next.clear();
        next.add(optIndex);
      }

      setSelections((prev) => ({ ...prev, [qIndex]: next }));

      // Single-select: an option and a custom answer replace each other, as in Claude Code.
      // Multi-select keeps both. The editing surface owns its text and never replays state
      // (docs/forms.md), so clearing state alone would leave stale text on screen that
      // submit ignores; clear the surface explicitly.
      if (!multiSelect && otherTexts[qIndex]) {
        setOtherTexts((prev) => {
          const nextTexts = { ...prev };
          delete nextTexts[qIndex];
          return nextTexts;
        });
        otherInputRef.current?.replaceText("");
      }

      if (!multiSelect && next.size > 0 && qIndex === activeQuestionIndex && questions) {
        setActiveQuestionIndex(Math.min(qIndex + 1, questions.length - 1));
      }
    },
    [activeQuestionIndex, otherTexts, questions, selections],
  );

  const setOtherText = useCallback(
    (qIndex: number, text: string) => {
      setOtherTexts((prev) => ({ ...prev, [qIndex]: text }));
      const multiSelect = questions?.[qIndex]?.multiSelect ?? false;
      if (!multiSelect && text.length > 0) {
        setSelections((prev) => {
          if (!prev[qIndex] || prev[qIndex].size === 0) return prev;
          return { ...prev, [qIndex]: new Set<number>() };
        });
      }
    },
    [questions],
  );

  const allAnswered = areQuestionsAnswered(questions, selections, otherTexts);
  const resolvedActiveQuestionIndex = questions
    ? Math.min(activeQuestionIndex, questions.length - 1)
    : 0;
  const activeQuestion = questions?.[resolvedActiveQuestionIndex];
  const activeQuestionAnswered = activeQuestion
    ? isQuestionAnswered(activeQuestion, resolvedActiveQuestionIndex, selections, otherTexts)
    : false;
  const isLastQuestion = questions ? resolvedActiveQuestionIndex === questions.length - 1 : true;

  const handleSubmit = useCallback(() => {
    if (!questions || !allAnswered || isResponding) return;
    setRespondingAction("submit");
    onRespond({
      behavior: "allow",
      updatedInput: {
        ...permission.request.input,
        answers: buildQuestionFormAnswers(questions, selections, otherTexts),
      },
    });
  }, [
    questions,
    allAnswered,
    isResponding,
    selections,
    otherTexts,
    onRespond,
    permission.request.input,
  ]);

  const handleDeny = useCallback(() => {
    if (!questions || isResponding) return;
    setRespondingAction("dismiss");
    if (shouldSubmitEmptyOnDismiss(questions)) {
      onRespond({
        behavior: "allow",
        updatedInput: {
          ...permission.request.input,
          answers: buildQuestionFormAnswers(questions, selections, otherTexts),
        },
      });
      return;
    }
    onRespond({
      behavior: "deny",
      message: "Dismissed by user",
    });
  }, [questions, isResponding, onRespond, otherTexts, permission.request.input, selections]);

  const handleSelectQuestion = useCallback((index: number) => {
    setActiveQuestionIndex(index);
  }, []);

  const navIsAnswered = useCallback(
    (qIndex: number) =>
      questions ? isQuestionAnswered(questions[qIndex], qIndex, selections, otherTexts) : false,
    [questions, selections, otherTexts],
  );

  const handlePrimaryAction = useCallback(() => {
    if (!isLastQuestion) {
      if (!activeQuestionAnswered || isResponding) return;
      setActiveQuestionIndex((index) => Math.min(index + 1, (questions?.length ?? 1) - 1));
      return;
    }
    handleSubmit();
  }, [activeQuestionAnswered, handleSubmit, isLastQuestion, isResponding, questions?.length]);

  const pendingAction = isResponding ? respondingAction : null;
  const primaryDisabled = isResponding || (isLastQuestion ? !allAnswered : !activeQuestionAnswered);
  const primaryActionLabel = isLastQuestion
    ? t("message.question.submit")
    : t("message.question.next");

  const containerStyle = useMemo(
    () => [
      styles.container,
      {
        backgroundColor: theme.colors.surface1,
        borderColor: theme.colors.border,
      },
      isMacPresentation && styles.macContainer,
    ],
    [isMacPresentation, theme.colors.surface1, theme.colors.border],
  );
  const questionTextStyle = useMemo(
    () => [styles.questionText, { color: theme.colors.foreground }],
    [theme.colors.foreground],
  );
  // Single-select radios need a group; checkboxes are valid standalone.
  const optionsGroupAccessibility = getOptionsGroupAccessibility(activeQuestion);
  if (!questions) {
    return null;
  }

  const canSkip = shouldSubmitEmptyOnDismiss(questions);
  const dismissLabel = resolveDismissLabel(
    questions,
    isMacPresentation && canSkip ? t("message.question.skip") : t("common.actions.dismiss"),
  );
  const selected = selections[resolvedActiveQuestionIndex] ?? new Set<number>();
  const otherText = otherTexts[resolvedActiveQuestionIndex] ?? "";
  const showTextInput = questionShowsTextInput(questions[resolvedActiveQuestionIndex]);

  return (
    <View style={containerStyle} testID="question-form-card">
      <QuestionFormHeader
        theme={theme}
        isMacPresentation={isMacPresentation}
        isResponding={isResponding}
        dismissLabel={dismissLabel}
        onDismiss={handleDeny}
      />
      <QuestionNav
        questions={questions}
        activeIndex={resolvedActiveQuestionIndex}
        isAnswered={navIsAnswered}
        isResponding={isResponding}
        onSelect={handleSelectQuestion}
      />
      <View style={[styles.questionHeader, isMacPresentation && styles.macQuestionHeader]}>
        <Text testID="question-form-current-question" style={questionTextStyle}>
          {activeQuestion?.question}
        </Text>
      </View>

      {activeQuestion ? (
        <View key={activeQuestion.question} style={styles.questionBlock}>
          {activeQuestion.options.length > 0 ? (
            <View style={styles.optionsWrap} {...optionsGroupAccessibility}>
              {activeQuestion.options.map((opt, optIndex) => (
                <QuestionOptionRow
                  key={opt.label}
                  qIndex={resolvedActiveQuestionIndex}
                  optIndex={optIndex}
                  option={opt}
                  isSelected={selected.has(optIndex)}
                  multiSelect={activeQuestion.multiSelect}
                  isMacPresentation={isMacPresentation}
                  isResponding={isResponding}
                  onToggle={toggleOption}
                />
              ))}
            </View>
          ) : null}
          {showTextInput ? (
            <QuestionOtherInput
              qIndex={resolvedActiveQuestionIndex}
              inputRef={otherInputRef}
              accessibilityLabel={activeQuestion.question}
              value={otherText}
              placeholder={getQuestionInputPlaceholder({
                question: activeQuestion,
                answerPlaceholder: t("message.question.answerPlaceholder"),
                otherPlaceholder: t("message.question.otherPlaceholder"),
              })}
              isResponding={isResponding}
              isMacPresentation={isMacPresentation}
              onChange={setOtherText}
              onSubmit={handlePrimaryAction}
            />
          ) : null}
        </View>
      ) : null}

      {responseError ? <Alert variant="error" description={responseError} size="sm" /> : null}

      <QuestionFormActions
        theme={theme}
        isMacPresentation={isMacPresentation}
        isMobile={isMobile}
        isResponding={isResponding}
        respondingAction={pendingAction}
        dismissLabel={dismissLabel}
        primaryDisabled={primaryDisabled}
        primaryActionLabel={primaryActionLabel}
        isLastQuestion={isLastQuestion}
        onDismiss={handleDeny}
        onPrimaryAction={handlePrimaryAction}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    padding: theme.spacing[3],
    borderRadius: theme.spacing[2],
    borderWidth: 1,
    gap: theme.spacing[3],
  },
  questionBlock: {
    gap: theme.spacing[2],
  },
  macOptionHighlight: {
    backgroundColor: rt.themeName === "dark" ? theme.colors.surface3 : theme.colors.surface2,
  },
  macSubmitText: { color: theme.colors.surface0 },
  macContainer: {
    padding: 16,
    borderRadius: 20,
    gap: 12,
    backgroundColor: rt.themeName === "dark" ? theme.colors.surface2 : theme.colors.surface1,
    borderColor: rt.themeName === "dark" ? theme.colors.borderAccent : theme.colors.border,
  },
  macTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  macTitleContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  macTitleText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
  },
  macCloseButton: {
    padding: 4,
    borderRadius: theme.borderRadius.base,
  },
  questionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[1],
    flex: 1,
  },
  macQuestionHeader: {
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  questionText: {
    flex: 1,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    lineHeight: 22,
  },
  optionsWrap: {
    gap: theme.spacing[1],
  },
  questionNav: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
  },
  questionNavButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    minHeight: 28,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
  },
  questionNavText: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
  },
  optionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  macOptionItem: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 32,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
  },
  optionItemPressed: {
    opacity: 0.9,
  },
  optionItemContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
  },
  optionTextBlock: {
    flex: 1,
    gap: theme.spacing[1],
  },
  macOptionNumber: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: theme.colors.foregroundExtraMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  macOptionNumberText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
  },
  optionLabel: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    lineHeight: 22,
  },
  optionDescription: {
    fontSize: theme.fontSize.base,
    lineHeight: 20,
  },
  optionPreviewText: {
    lineHeight: 20,
    ...(isWeb ? { whiteSpace: "pre-wrap", overflowWrap: "break-word" } : null),
  },
  selectionControl: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: theme.borderWidth[1],
    marginTop: 2, // optical-align 18px control to the 22px label first line
  },
  selectionControlCheckbox: {
    borderRadius: theme.borderRadius.base,
  },
  selectionControlRadio: {
    borderRadius: 999,
  },
  selectionRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  otherInput: {
    borderWidth: 1,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    fontSize: theme.fontSize.base,
  },
  macOtherInputRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 9,
    borderWidth: 1,
    borderRadius: 16,
    borderColor: "transparent",
  },
  macOtherInputRowFocused: {
    borderColor: rt.themeName === "dark" ? "#d7b9ad" : theme.colors.borderAccent,
  },
  macOtherInput: {
    flex: 1,
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
    lineHeight: 20,
    maxHeight: 240,
    backgroundColor: "transparent",
  },
  actionsContainer: {
    gap: theme.spacing[2],
  },
  actionsContainerDesktop: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
  },
  macActionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  actionButton: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    borderWidth: theme.borderWidth[1],
  },
  macDismissButton: {
    minHeight: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: rt.themeName === "dark" ? theme.colors.surface3 : theme.colors.surface2,
  },
  macSubmitButton: {
    minHeight: 28,
    paddingHorizontal: 12,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.foreground,
  },
  macActionButtonDisabled: {
    opacity: theme.opacity[50],
  },
  actionContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  actionText: {
    fontSize: theme.fontSize.base,
  },
}));
