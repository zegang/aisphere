import 'i18next';
import { resources } from './locales';

// This extends the i18next type definitions
declare module 'i18next' {
  interface CustomTypeOptions {
    // defaultNS is 'translation' if you don't define namespaces in init
    // If you define `defaultNS: 'common'` in your i18n.init,
    // then you'd use: `defaultNS: 'common';`
    // And remove `fallbackNS` if you don't use it.
    defaultNS: 'common'; // The default namespace when calling t('key') without specifying it
    resources: typeof resources; // This ensures your `resources` object type is used
  }
}
