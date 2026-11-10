import { css } from "lit";

/**
 * Text fields and selects keep their rounded corners while every button is a
 * pill (the radius token is set to pill on :root, see styles.css). Include
 * it in every component that renders a wa-input, wa-select or wa-textarea:
 * it has to live in the component's shadow root, a document rule can't
 * reach them.
 */
export const fieldStyles = css`
  wa-input,
  wa-select,
  wa-textarea {
    --wa-form-control-border-radius: var(--wa-border-radius-m);
  }
`;
