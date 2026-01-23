/**
 * Document Number Generator Utility
 * Format: REQ/{0001}/{DEPT}/{ROMAN_MONTH}/{YEAR}
 * 
 * - Sequence number (0001) is 4 digits, padded with zeros
 * - Sequence is unique per Department and per Year
 * - Resets to 0001 when year changes or for different departments
 */

// Roman numeral conversion for months (I-XII)
const ROMAN_MONTHS: Record<number, string> = {
    1: 'I',
    2: 'II',
    3: 'III',
    4: 'IV',
    5: 'V',
    6: 'VI',
    7: 'VII',
    8: 'VIII',
    9: 'IX',
    10: 'X',
    11: 'XI',
    12: 'XII',
};

/**
 * Convert month number (1-12) to Roman numeral
 */
export function monthToRoman(month: number): string {
    if (month < 1 || month > 12) {
        throw new Error(`Invalid month: ${month}. Must be between 1 and 12.`);
    }
    return ROMAN_MONTHS[month];
}

/**
 * Pad a number to 4 digits with leading zeros
 */
export function padSequence(num: number): string {
    return num.toString().padStart(4, '0');
}

/**
 * Format a document number from its components
 */
export function formatDocNumber(
    sequence: number,
    deptCode: string,
    month: number,
    year: number
): string {
    const paddedSeq = padSequence(sequence);
    const romanMonth = monthToRoman(month);
    return `REQ/${paddedSeq}/${deptCode}/${romanMonth}/${year}`;
}

/**
 * Parse a document number back to its components
 */
export function parseDocNumber(docNumber: string): {
    sequence: number;
    deptCode: string;
    month: number;
    year: number;
} | null {
    const regex = /^REQ\/(\d{4})\/([A-Z0-9]+)\/(I{1,3}|IV|V|VI{0,3}|IX|X|XI{0,2}|XII?)\/(\d{4})$/;
    const match = docNumber.match(regex);

    if (!match) {
        return null;
    }

    const romanToMonth: Record<string, number> = {};
    Object.entries(ROMAN_MONTHS).forEach(([num, roman]) => {
        romanToMonth[roman] = parseInt(num, 10);
    });

    return {
        sequence: parseInt(match[1], 10),
        deptCode: match[2],
        month: romanToMonth[match[3]] || 1,
        year: parseInt(match[4], 10),
    };
}

/**
 * Generate a preview document number (client-side, for display only)
 * The actual sequence number should be fetched from the server
 */
export function generateDocNumberPreview(
    deptCode: string,
    date: Date,
    previewSequence: number = 1
): string {
    const month = date.getMonth() + 1; // JS months are 0-indexed
    const year = date.getFullYear();
    return formatDocNumber(previewSequence, deptCode, month, year);
}
