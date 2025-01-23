// Generic utility types
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type ValueOf<T> = T[keyof T];

// Function types
export type AsyncVoidFunction = () => Promise<void>;
export type ErrorCallback = (error: Error) => void;

// Object types
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

// Logging types
export interface LogContext {
  action: string;
  component: string;
  metadata?: Record<string, unknown>;
}
