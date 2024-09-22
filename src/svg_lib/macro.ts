export const define_and_execute_once = (f: (...args: any) => any): ( (...args: any) => any) => (f(), f);

export const define = (f: (...args: any) => any): ( (...args: any) => any) => f;