export function isValidCpf(value: string): boolean {
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) {
    return false;
  }

  const digits = [...value].map(Number);
  const first = cpfDigit(digits.slice(0, 9), 10);
  const second = cpfDigit([...digits.slice(0, 9), first], 11);
  return digits[9] === first && digits[10] === second;
}

export function isValidCnpj(value: string): boolean {
  if (!/^\d{14}$/.test(value) || /^(\d)\1{13}$/.test(value)) {
    return false;
  }

  const digits = [...value].map(Number);
  const first = cnpjDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = cnpjDigit(
    [...digits.slice(0, 12), first],
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  return digits[12] === first && digits[13] === second;
}

function cpfDigit(digits: readonly number[], initialWeight: number): number {
  const remainder =
    digits.reduce((sum, digit, index) => sum + digit * (initialWeight - index), 0) % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function cnpjDigit(digits: readonly number[], weights: readonly number[]): number {
  const remainder =
    digits.reduce((sum, digit, index) => sum + digit * (weights[index] ?? 0), 0) % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}
