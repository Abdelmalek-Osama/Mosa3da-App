import "server-only";
import { getLocale } from "next-intl/server";
import { isLocale } from "./config";
import { localizeFieldErrors, localizeServerText } from "./server-text";

interface FormStateLike {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string | undefined>;
}

/** Translates the English messages of a form-action state into the visitor's language. */
export async function localizeState<S extends FormStateLike>(state: S): Promise<S> {
  const locale = await getLocale().catch(() => "en");
  if (!isLocale(locale) || locale === "en") return state;
  return {
    ...state,
    error: state.error ? localizeServerText(state.error, locale) : state.error,
    notice: state.notice ? localizeServerText(state.notice, locale) : state.notice,
    fieldErrors: state.fieldErrors ? localizeFieldErrors(state.fieldErrors, locale) : state.fieldErrors,
  };
}
