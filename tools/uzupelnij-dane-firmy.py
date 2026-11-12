"""Wstawia dane firmy w strony prawne www/. Użycie:
python3 tools/uzupelnij-dane-firmy.py "Nazwa" "Adres" "NIP" "REGON/KRS" "Telefon" "Adres zwrotu" "Data"
"""
import re, sys, pathlib
keys=["NAZWA FIRMY","ADRES","NIP","REGON / KRS","TELEFON","ADRES ZWROTU","DATA"]
vals=dict(zip(keys,sys.argv[1:]))
for f in ["regulamin.html","polityka-prywatnosci.html","odstapienie.html"]:
    p=pathlib.Path(__file__).parent.parent/"www"/f; s=p.read_text(encoding="utf-8")
    for k,v in vals.items(): s=s.replace(f'<span class="todo">[[{k}]]</span>',v)
    left=re.findall(r"\[\[([^\]]+)\]\]",s); p.write_text(s,encoding="utf-8")
    print(f, "OK" if not left else "brakuje: "+", ".join(sorted(set(left))))
