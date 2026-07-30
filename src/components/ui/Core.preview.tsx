/* Hallmark · component preview: core UI system · all eight interactive states */

import {
  UiAlert,
  UiAvatar,
  UiBadge,
  UiButton,
  UiDialog,
  UiField,
  UiPanel,
  UiPanelHeader,
  type UiState,
} from './Core';

const STATES: Array<{
  label: string;
  state?: UiState;
  className?: string;
  disabled?: boolean;
}> = [
  { label: 'Default' },
  { label: 'Hover', className: 'is-hover' },
  { label: 'Focus', className: 'is-focus' },
  { label: 'Active', className: 'is-active' },
  { label: 'Disabled', disabled: true },
  { label: 'Loading', state: 'loading' },
  { label: 'Error', state: 'error' },
  { label: 'Success', state: 'success' },
];

export default function CorePreview() {
  return (
    <UiPanel className="ui-preview">
      <UiPanelHeader
        title="Core components"
        description="Production primitives and their forced verification states."
        meta={<UiBadge tone="accent">Preview</UiBadge>}
      />
      <div className="ui-preview-grid">
        <section>
          <h3>Button states</h3>
          {STATES.map((item) => (
            <div className="ui-preview-row" key={item.label}>
              <span>{item.label}</span>
              <UiButton
                className={item.className}
                disabled={item.disabled}
                state={item.state}
                variant="primary"
              >
                {item.state === 'loading' ? 'Working' : item.label}
              </UiButton>
            </div>
          ))}
        </section>
        <section>
          <h3>Fields and identity</h3>
          <UiField label="Default field" hint="Helper text stays in a stable row.">
            <input defaultValue="Configured value" />
          </UiField>
          <UiField label="Error field" error="Add the missing value before continuing.">
            <input defaultValue="" />
          </UiField>
          <UiField label="Success field" success="Saved">
            <input defaultValue="Ready" />
          </UiField>
          <div className="ui-preview-identities">
            <UiAvatar name="Anurag Kumar" seed={1} />
            <UiBadge tone="positive">Confirmed</UiBadge>
            <UiBadge tone="warning">Needs review</UiBadge>
          </div>
          <UiAlert tone="info">Informational messages stay close to their control.</UiAlert>
        </section>
      </div>
      <UiDialog open={false} onClose={() => undefined} labelId="ui-preview-dialog-title">
        <h2 id="ui-preview-dialog-title">Dialog preview</h2>
      </UiDialog>
    </UiPanel>
  );
}
