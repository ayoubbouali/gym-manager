# Listes régionales

| Fichier | Source | Licence |
| --- | --- | --- |
| `zone.tab` | IANA tz database | domaine public |
| `cities.tsv` | GeoNames `cities15000.zip` (villes de plus de 15 000 habitants) | CC BY 4.0 |
| `capitals.tsv` | GeoNames `countryInfo.txt` (colonne capitale) | CC BY 4.0 |

Données GeoNames : <https://www.geonames.org/>, sous licence
[Creative Commons Attribution 4.0](https://creativecommons.org/licenses/by/4.0/).

`cities.tsv` est réduit à quatre colonnes séparées par des tabulations : code pays ISO, nom, fuseau IANA,
population (colonnes 9, 2, 18 et 15 de GeoNames). Un même nom dans un même pays n'est gardé qu'une fois, la ville la
plus peuplée. Tri : pays, puis population décroissante.

`capitals.tsv` : code pays ISO, nom de la capitale.

Mise à jour :

```bash
curl -O https://download.geonames.org/export/dump/cities15000.zip && unzip cities15000.zip
curl -O https://download.geonames.org/export/dump/countryInfo.txt
awk -F'\t' '$9 != "" && $18 != "" { print $9 "\t" $2 "\t" $18 "\t" ($15 == "" ? 0 : $15) }' cities15000.txt \
  | LC_ALL=C sort -t$'\t' -k1,1 -k4,4nr -k2,2 | awk -F'\t' '!seen[$1 FS $2]++' > cities.tsv
grep -v '^#' countryInfo.txt | awk -F'\t' '$6 != "" { print $1 "\t" $6 }' > capitals.tsv
```
