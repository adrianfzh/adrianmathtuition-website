import { describe, expect, it } from 'vitest';
import { tidyChemText } from './chem-text';

describe('tidyChemText', () => {
  it('sets formula digits as subscripts and a times sign between numbers', () => {
    expect(tidyChemText('Mr of I2 = 2 x 127 = 254')).toBe('Mr of I₂ = 2 × 127 = 254');
    expect(tidyChemText('H2SO4 reacts with 2NaOH to give Na2SO4 and H2O.')).toBe('H₂SO₄ reacts with 2NaOH to give Na₂SO₄ and H₂O.');
    expect(tidyChemText('CO2 and CaCO3')).toBe('CO₂ and CaCO₃');
  });
  it('leaves mark codes, maths, charges, images and plain words alone', () => {
    expect(tidyChemText('[M1] then [A1], B1 for the unit')).toBe('[M1] then [A1], B1 for the unit');
    expect(tidyChemText('$H_2O$ is fine; so is $2 x 3$')).toBe('$H_2O$ is fine; so is $2 x 3$');
    expect(tidyChemText('Fe2+ ions and SO4 2- ions')).toBe('Fe2+ ions and SO4 2- ions');
    expect(tidyChemText('![fig](phys_a2_b3.png) Q6 and P2')).toBe('![fig](phys_a2_b3.png) Q6 and P2');
    expect(tidyChemText('Answer: B.')).toBe('Answer: B.');
  });
});
