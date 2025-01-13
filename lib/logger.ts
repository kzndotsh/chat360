interface LogContext {
  filename: string;
  functionName: string;
  message: string;
}

export const logWithContext = (
  filename: string,
  functionName: string,
  message: string,
) => {
  console.log(`[${filename}] [${functionName}]: ${message}`);
};
