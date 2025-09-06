// Utility function to parse command line arguments as key=value pairs
export const parseArgs = (args: string[] = process.argv.slice(2)) => {
    const parsed: Record<string, string> = {};

    args.forEach(arg => {
        const [key, ...valueParts] = arg.split('=');
        if (valueParts.length > 0) {
            parsed[key] = valueParts.join('='); // Handle values with = in them
        }
    });

    return {
        get: (key: string, defaultValue?: string) => parsed[key] ?? defaultValue
    };
}
