import { localize } from "../../localization/localize.js";
import { LitElement, html } from "lit";
import { ViewAccessibility } from "../../utils/view-accessibility.js";
import {
  InstallDiagnostics,
  logFrontendError,
} from "../../utils/diagnostics.js";
import { customElement, query, state } from "lit/decorators.js";
import { wizardState } from "../../state/wizard-state.js";
import { checkUtmVmName, getSystemInfo } from "../../api/commands.js";
import { installerError } from "../../utils/installer-error.js";
import type { SystemInfo } from "../../api/types.js";
import {
  DEFAULT_UTM_VM_NAME,
  isValidUtmVmName,
  memoryOptionsUpTo,
} from "../../state/vm-defaults.js";
import { settingStyles } from "../../utils/setting-styles.js";
import { fieldErrorStyles } from "../../utils/field-error.js";
import { VmSettings, configCardStyles } from "../../utils/vm-settings.js";
import { renderStepHeading, stepStyles } from "../../utils/step-styles.js";
import { fieldStyles } from "../../utils/field-styles.js";

/**
 * The cores and memory to offer on this system: every even core count up to
 * its own, and its memory less 2 GB for the host. Without the system's
 * figures, those of an 8-core system with 16 GB.
 */
function resourceOptions(systemInfo: SystemInfo | null) {
  const maxCores = systemInfo?.cpu_cores || 8;
  const cores: number[] = [];
  for (let count = 2; count <= maxCores; count += 2) {
    cores.push(count);
  }
  const maxMemoryMb = systemInfo?.memory_mb || 16384;
  return {
    // Two at least, even on a system with one
    cores: cores.length ? cores : [2],
    memory: memoryOptionsUpTo(maxMemoryMb - 2048),
  };
}

@customElement("utm-configure-view")
export class UtmConfigureView extends LitElement {
  protected readonly _accessibility = new ViewAccessibility(this);
  static styles = [
    fieldStyles,
    stepStyles,
    settingStyles,
    fieldErrorStyles,
    configCardStyles,
  ];

  private readonly _vm = new VmSettings(this, {
    defaultName: DEFAULT_UTM_VM_NAME,
    // The check at Next can still refuse a name UTM already uses
    nameError: (name) =>
      isValidUtmVmName(name)
        ? this._checkError
        : localize("views.utm.utm_configure_view.vm_name_required"),
    nameHint: () => localize("views.utm.utm_configure_view.vm_name_hint"),
    save: () => this._saveSelections(),
  });

  /** What the sliders offer, kept until the system lookup changes it */
  @state()
  private _options = resourceOptions(null);

  /** Why the check at Next refused the name, shown at its field */
  @state() private _checkError: string | undefined;

  @query(".name-hint") private _nameHint?: HTMLElement;

  connectedCallback() {
    super.connectedCallback();
    this._vm.restore(wizardState.getState().selections);
    void this._loadSystemInfo();
  }

  private async _loadSystemInfo() {
    try {
      const systemInfo = await getSystemInfo();

      // The user may have left this step while the lookup was in flight;
      // saving now would write over what the next step reads
      if (!this.isConnected) return;

      this._options = resourceOptions(systemInfo);

      // Cap the selected values to what this system can offer
      const { cores, memory } = this._options;
      if (!cores.includes(this._vm.cpuCores)) {
        this._vm.set({ cpuCores: cores[cores.length - 1] || 2 });
      }
      if (!memory.includes(this._vm.memoryMb)) {
        this._vm.set({ memoryMb: memory[memory.length - 1] || 2048 });
      }

      this._saveSelections();
    } catch (error) {
      logFrontendError(error);
      // Keep the restored values (or defaults), unless this step was left
      // while the lookup was in flight
      if (this.isConnected) {
        this._saveSelections();
      }
    }
  }

  private _saveSelections() {
    // Cleared first, so it can't hold Next back: Next runs the check again
    this._checkError = undefined;
    wizardState.setSelections(this._vm.selections);
  }

  /**
   * Ask UTM whether the name is free, so a taken one shows here, where it
   * can be changed, instead of failing the install. Resolves false if it is
   * taken, or if the settings changed or the step was left meanwhile.
   */
  async check(): Promise<boolean> {
    const selections = wizardState.getState().selections;
    const isCurrent = () =>
      this.isConnected && wizardState.getState().selections === selections;
    try {
      await checkUtmVmName(selections.vmName ?? DEFAULT_UTM_VM_NAME);
      if (!isCurrent()) return false;
      this._checkError = undefined;
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      new InstallDiagnostics("utm").fail(error);
      this._checkError = installerError(error).message;
      await this.updateComplete;
      const field = this._nameHint?.closest<HTMLElement>("wa-input");
      // Once the field has its error, so it is read out with it
      await (field as { updateComplete?: Promise<unknown> } | null | undefined)
        ?.updateComplete;
      field?.focus();
      return false;
    }
  }

  render() {
    return html`
      ${renderStepHeading(
        localize("common.vm.configure_virtual_machine"),
        localize("views.utm.utm_configure_view.subtitle")
      )}

      <div class="config-card">
        ${this._vm.renderName()}
        ${this._vm.renderResources(this._options.cores, this._options.memory)}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "utm-configure-view": UtmConfigureView;
  }
}
