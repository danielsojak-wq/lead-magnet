-- Diagnostika atribuce — plná landing URL z prvního načtení (entry point).
-- Umožní u leadu s prázdným UTM rozlišit "reklama neměla UTM v URL" (mezera
-- v Meta šabloně / in-app browser) vs "UTM v URL byla, ale nezachytila se".
-- First-touch (stejně jako utm_*), nullable + additive.
ALTER TABLE lm_sessions ADD COLUMN IF NOT EXISTS landing_url text;
