import { describe, it, expect } from 'vitest';
import { registerUserSchema, loginUserSchema } from '@shared/models/auth';

// Regole di validazione registrazione/login. Sono l'unica logica di business "pura"
// di emme oggi: il resto è CRUD. Qui proteggiamo le regole password/email.

const validReg = {
  email: 'enrico@example.com',
  password: 'Password1',
  firstName: 'Enrico',
  lastName: 'Maggiolo',
};

describe('registerUserSchema', () => {
  it('accetta una registrazione valida', () => {
    expect(registerUserSchema.safeParse(validReg).success).toBe(true);
  });

  it('rifiuta email non valida', () => {
    expect(registerUserSchema.safeParse({ ...validReg, email: 'non-una-email' }).success).toBe(false);
  });

  it('rifiuta password troppo corta (<8)', () => {
    expect(registerUserSchema.safeParse({ ...validReg, password: 'Pass1' }).success).toBe(false);
  });

  it('richiede almeno una maiuscola, una minuscola e un numero', () => {
    expect(registerUserSchema.safeParse({ ...validReg, password: 'password1' }).success).toBe(false); // no maiuscola
    expect(registerUserSchema.safeParse({ ...validReg, password: 'PASSWORD1' }).success).toBe(false); // no minuscola
    expect(registerUserSchema.safeParse({ ...validReg, password: 'Passwordd' }).success).toBe(false); // no numero
  });

  it('richiede nome e cognome non vuoti', () => {
    expect(registerUserSchema.safeParse({ ...validReg, firstName: '' }).success).toBe(false);
    expect(registerUserSchema.safeParse({ ...validReg, lastName: '' }).success).toBe(false);
  });
});

describe('loginUserSchema', () => {
  it('accetta email valida + password non vuota', () => {
    expect(loginUserSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
  });

  it('rifiuta password vuota', () => {
    expect(loginUserSchema.safeParse({ email: 'a@b.com', password: '' }).success).toBe(false);
  });
});
