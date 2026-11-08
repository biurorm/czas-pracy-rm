# Czas pracy RM

PWA do sprawdzania, ile czasu pracuję dziennie, tygodniowo i miesięcznie. Zbudowana 08.11.2026 dla Rafała.

- **Dziś:** duży licznik ▶ Start / ⏹ Stop z rodzajem pracy (biuro, prezentacje i teren, spotkania, telefony i maile, dokumenty i urzędy, marketing, nauka, inne). Klik w inny rodzaj, gdy licznik chodzi = obecny wpis się kończy, nowy startuje. Licznik zapisany w bazie, chodzi też po zamknięciu aplikacji i na drugim urządzeniu. Zapomniany licznik z poprzedniego dnia: „Zatrzymaj o tej godzinie”. Start krótszy niż minuta nie zostaje. „＋ Dodaj ręcznie”, klik we wpis = zmiana albo usunięcie.
- **Tydzień:** suma, pasek do normy (⚙: 30–50 h, domyślnie 40), ponad normę / brakuje, dni pracy, średnio na dzień, weekend, słupki dzień po dniu, „Na co poszedł czas”, wniosek z liczb.
- **Miesiąc:** suma do normy etatu (dni robocze pn–pt bez świąt ustawowych, z Wigilią od 2025, × 8 h; w trwającym miesiącu także do dziś), tydzień po tygodniu, najdłuższy dzień, rodzaje, wniosek.
- Wpis przez północ dzieli się na dni.

Dane w bazie Zadań RM (Supabase `zadania-rm`), to samo logowanie. Tabela `czas_pracy` z `setup.sql` (uruchom RAZ w Supabase > SQL Editor). Każdy widzi tylko swój czas, także menedżer nie widzi cudzego.
Tryb próbny: `index.html?proba` (dane w przeglądarce).

Wydanie: podbij `WERSJA` w app.js, `?v=` w index.html i `CACHE` w sw.js, potem `bash publikuj.sh "opis"`.
