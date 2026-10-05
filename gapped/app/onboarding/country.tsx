import React, { useCallback, useState } from 'react';
import { Button } from '@/components/Button';
import { OnboardingFrame } from '@/components/OnboardingFrame';
import { countryByCode } from '@/data/countries';
import { CountryProof } from '@/onboarding/place/CountryProof';
import { countryTitle } from '@/onboarding/place/countryCopy';
import { CountrySheet } from '@/onboarding/place/CountrySheet';
import { useArrival } from '@/onboarding/place/useArrival';
import { useCountryProof } from '@/onboarding/place/useCountryProof';
import { useOnboardingAdvance } from '@/onboarding/useOnboardingAdvance';
import { useProfile } from '@/state/profile';

/**
 * Country + proof (docs/ONBOARDING.md, step 6).
 *
 * The step is the proof screen; choosing happens in a sheet over it. On the
 * first visit — no country yet — the sheet rises by itself once the screen has
 * landed, so the question is asked straight away. Every later change goes
 * through the lime country name, which reopens it. The proof underneath
 * reacts to whatever is chosen: the map crossfades and the line swaps.
 *
 * The country decides which national board a driver is ranked on, so it is
 * never guessed for them: the phone's region is offered as the sheet's first
 * row, and Continue waits for a real choice.
 *
 * The headline follows the count line's answer (countryTitle): "You're in
 * good company" only over a real count, "Start the {Country} board" where the
 * board is still early. Both read the one proof fetched here.
 */
export default function CountryStep() {
  const advance = useOnboardingAdvance('/onboarding/country');
  const country = useProfile((s) => s.country);
  const setCountry = useProfile((s) => s.setCountry);
  const arrived = useArrival();

  /*
   * Whether the sheet is up: the person's last word on it, or — until they
   * have had one — whether this is the first visit and the screen has landed.
   * Derived rather than set from an effect, so the sheet rises in the same
   * commit that learns of the arrival. The first visit is frozen at mount:
   * coming Back to a step that already has a country must not throw the sheet
   * up again.
   */
  const [firstVisit] = useState(() => country === null);
  const [sheetChoice, setSheetChoice] = useState<boolean | null>(null);
  const sheetOpen = sheetChoice ?? (firstVisit && arrived);
  const openSheet = useCallback(() => setSheetChoice(true), []);
  const closeSheet = useCallback(() => setSheetChoice(false), []);

  const chosen = countryByCode(country);
  const proof = useCountryProof(chosen?.code ?? null);

  return (
    <>
      <OnboardingFrame
        route="/onboarding/country"
        centered
        title={countryTitle(proof, chosen ?? null)}
        subtitle={chosen ? undefined : "Your country decides which national board you're ranked on."}
        footer={
          chosen ? (
            <Button label="Continue" variant="light" onPress={advance} />
          ) : (
            // Closing the sheet without a pick leaves the way back in where
            // Continue will be, rather than a dead grey button.
            <Button label="Select country" variant="light" onPress={openSheet} />
          )
        }
      >
        <CountryProof
          country={chosen ?? null}
          proof={proof}
          onChange={openSheet}
          play={arrived}
        />
      </OnboardingFrame>
      <CountrySheet
        visible={sheetOpen}
        selected={country}
        onSelect={setCountry}
        onClose={closeSheet}
      />
    </>
  );
}
