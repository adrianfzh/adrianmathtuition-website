import { describe, expect, it } from 'vitest';
import { tidyChemText } from './chem-text';

describe('tidyChemText', () => {
  it('formulae, ions, bracketed groups, units and powers in a question stem (5 Oct 2026)', () => {
    expect(tidyChemText('CuFeS2 reacts')).toBe('CuFeS₂ reacts');
    expect(tidyChemText('A) (NH4)2SO4')).toBe('A) (NH₄)₂SO₄');
    expect(tidyChemText('contains Fe2+ and Cl- ions, not Na+.')).toBe('contains Fe²⁺ and Cl⁻ ions, not Na⁺.');
    expect(tidyChemText('25.0 cm3 of acid, 24 dm3 of gas, 2.0 m/s2, 4 m s-1')).toBe('25.0 cm³ of acid, 24 dm³ of gas, 2.0 m/s², 4 m s⁻¹');
    expect(tidyChemText('2H2O and 10^-3 mol')).toBe('2H₂O and 10⁻³ mol');
    expect(tidyChemText('Options A, B, C and D. A- B')).toBe('Options A, B, C and D. A- B');
    expect(tidyChemText('{{IMG:Fig_CO2.png}} shows CO2')).toBe('{{IMG:Fig_CO2.png}} shows CO₂');
  });
  it('sets formula digits as subscripts and a times sign between numbers', () => {
    expect(tidyChemText('Mr of I2 = 2 x 127 = 254')).toBe('Mr of I₂ = 2 × 127 = 254');
    expect(tidyChemText('H2SO4 reacts with 2NaOH to give Na2SO4 and H2O.')).toBe('H₂SO₄ reacts with 2NaOH to give Na₂SO₄ and H₂O.');
    expect(tidyChemText('CO2 and CaCO3')).toBe('CO₂ and CaCO₃');
  });
  it('leaves mark codes, maths, charges, images and plain words alone', () => {
    expect(tidyChemText('[M1] then [A1], B1 for the unit')).toBe('[M1] then [A1], B1 for the unit');
    expect(tidyChemText('$H_2O$ is fine; so is $2 x 3$')).toBe('$H_2O$ is fine; so is $2 x 3$');
    expect(tidyChemText('Fe2+ ions and SO4 2- ions')).toBe('Fe²⁺ ions and SO4 2- ions');
    expect(tidyChemText('![fig](phys_a2_b3.png) Q6 and P2')).toBe('![fig](phys_a2_b3.png) Q6 and P2');
    expect(tidyChemText('Answer: B.')).toBe('Answer: B.');
  });
});
