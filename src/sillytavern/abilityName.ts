/** Remove only the generated mechanics fingerprint at the end of an ability name. */
export function abilityDisplayName(name: string): string {
  return name.replace(/\s*(?:〔[a-z0-9]{7}〕|\[[a-z0-9]{7}\])$/i, '');
}

/** Legacy receipts keep their original names and identities; format a display copy only. */
export function fragmentDisplayName(name: string): string {
  const suffix = '灵魂碎片';
  return name.endsWith(suffix)
    ? abilityDisplayName(name.slice(0, -suffix.length)) + suffix
    : name;
}
