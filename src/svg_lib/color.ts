export const rand_hex_color = () => {
    const r = Math.random() * 256 | 0;
    const g = Math.random() * 256 | 0;
    const b = Math.random() * 256 | 0;
    const sr = r.toString(16).padStart(2, "0").toUpperCase();
    const sg = g.toString(16).padStart(2, "0").toUpperCase();
    const sb = b.toString(16).padStart(2, "0").toUpperCase();
    return `#${sr}${sg}${sb}`;
}