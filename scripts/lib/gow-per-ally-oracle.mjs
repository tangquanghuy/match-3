/** Independent source recognizer: no compiled prototype is used to derive expectations. */
export function perAllyMixSpec(text) {
  const m=/^Deal \[Magic \+ (\d+)\] damage to an Enemy,? boosted by (.+?) Allies[.,]\s*Then create a mix of (\d+) (Red|Blue|Green|Yellow|Purple|Brown) and (Red|Blue|Green|Yellow|Purple|Brown) Gems for each (.+?) (?:Ally|Allies)\. \[x(\d+)\]$/i.exec(text ?? '');
  if(!m || m[2]!==m[6]) return null;
  return {damageBase:Number(m[1]),category:m[2],perAlly:Number(m[3]),colors:[m[4],m[5]],damageBoost:Number(m[7])};
}
