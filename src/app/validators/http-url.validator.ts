import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export function httpUrlValidator(): ValidatorFn {
  return (control: AbstractControl<string>): ValidationErrors | null => {
    const value = control.value?.trim();

    if (!value) {
      return null;
    }

    try {
      const url = new URL(value);
      const isSupportedProtocol =
        url.protocol === 'http:' || url.protocol === 'https:';

      return isSupportedProtocol ? null : { httpUrl: true };
    } catch {
      return { httpUrl: true };
    }
  };
}
