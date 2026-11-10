import { showStartupError } from './startup-error';

let startupFailureShown = false;

const handleStartupFailure = (error: unknown): void => {
  if (startupFailureShown) return;
  startupFailureShown = true;
  process.off('uncaughtException', handleUncaughtException);
  process.off('unhandledRejection', handleUnhandledRejection);
  void showStartupError(error);
};

const handleUncaughtException = (error: Error): void => {
  handleStartupFailure(error);
};

const handleUnhandledRejection = (reason: unknown): void => {
  handleStartupFailure(reason);
};

process.on('uncaughtException', handleUncaughtException);
process.on('unhandledRejection', handleUnhandledRejection);

void import('./application').then(
  () => {
    process.off('uncaughtException', handleUncaughtException);
    process.off('unhandledRejection', handleUnhandledRejection);
  },
  handleStartupFailure,
);
