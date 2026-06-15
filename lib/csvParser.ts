
/**
 * Simple CSV Parser for Accounting Data
 * Handles comma or semicolon delimiters and Cyrillic characters.
 */
export const parseCSV = (text: string) => {
    if (!text) return [];

    // Determine delimiter (comma or semicolon)
    const firstLine = text.split('\n')[0];
    const delimiter = firstLine.includes(';') ? ';' : ',';

    const rows = text.split('\n').filter(line => line.trim().length > 0);
    if (rows.length === 0) return [];

    // Helper to handle quoted values with delimiters inside
    const splitLine = (line: string) => {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === delimiter && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    };

    const headers = splitLine(rows[0]).map(h => h.replace(/^"|"$/g, '').trim());

    const data = rows.slice(1).map(row => {
        const values = splitLine(row);
        const item: Record<string, string> = {};
        headers.forEach((header, index) => {
            item[header] = values[index] ? values[index].replace(/^"|"$/g, '').trim() : '';
        });
        return item;
    });

    return data;
};
