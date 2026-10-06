import { describe, it, expect } from "vitest";
import { clientContactSchema, clientSchema } from "@/lib/validation/client";

const validContact = {
  first_name: "Kadri",
  last_name: "Mets",
  email: "kadri@balticretail.ee",
  phone: "+372 555 1234",
  role: "CEO",
  is_primary: true,
};

const validClient = {
  name: "Baltic Retail Group",
  notes: "Prefers Friday demos.",
  contacts: [validContact, { ...validContact, first_name: "Marko", last_name: "Saar", is_primary: false }],
};

describe("clientSchema", () => {
  it("accepts a fully populated valid client", () => {
    expect(clientSchema.safeParse(validClient).success).toBe(true);
  });

  it("accepts a client with only a name and no contacts", () => {
    expect(clientSchema.safeParse({ name: "Acme Inc", contacts: [] }).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(clientSchema.safeParse({ ...validClient, name: "  " }).success).toBe(false);
  });

  it("rejects a missing name", () => {
    const { name, ...rest } = validClient;
    void name;
    expect(clientSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a missing contacts array", () => {
    expect(clientSchema.safeParse({ name: "Acme Inc" }).success).toBe(false);
  });

  it("normalizes blank notes to null", () => {
    const parsed = clientSchema.parse({ ...validClient, notes: "   " });
    expect(parsed.notes).toBeNull();
  });

  it("trims a name with surrounding whitespace", () => {
    const parsed = clientSchema.parse({ ...validClient, name: "  Acme Inc  " });
    expect(parsed.name).toBe("Acme Inc");
  });

  it("rejects a name over 200 characters", () => {
    expect(clientSchema.safeParse({ ...validClient, name: "a".repeat(201) }).success).toBe(false);
  });

  it("rejects a contact with a malformed email", () => {
    expect(
      clientSchema.safeParse({
        ...validClient,
        contacts: [{ ...validContact, email: "not-an-email" }],
      }).success
    ).toBe(false);
  });

  it("rejects a contact without a first name", () => {
    expect(
      clientSchema.safeParse({ ...validClient, contacts: [{ ...validContact, first_name: "  " }] })
        .success
    ).toBe(false);
  });

  it("accepts split contact names and company extras", () => {
    const r = clientSchema.safeParse({
      name: "A",
      reg_code: "123",
      email: "a@b.ee",
      website: "https://a.ee",
      contacts: [{ first_name: "Mari", last_name: "Maasikas", gender: "female", description: "x" }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects javascript: website", () =>
    expect(clientSchema.safeParse({ name: "A", website: "javascript:x", contacts: [] }).success).toBe(
      false
    ));

  it("normalizes blank reg_code/email/website to null", () => {
    const parsed = clientSchema.parse({ ...validClient, reg_code: "  ", email: "", website: "" });
    expect(parsed.reg_code).toBeNull();
    expect(parsed.email).toBeNull();
    expect(parsed.website).toBeNull();
  });
});

describe("clientContactSchema", () => {
  it("accepts a contact with only a first name", () => {
    expect(clientContactSchema.safeParse({ first_name: "Solo", is_primary: false }).success).toBe(true);
  });

  it("normalizes blank optional text (email/phone/role/last_name/description) to null", () => {
    const parsed = clientContactSchema.parse({
      ...validContact,
      last_name: "",
      email: "",
      phone: "  ",
      role: "",
      description: "",
    });
    expect(parsed.last_name).toBeNull();
    expect(parsed.email).toBeNull();
    expect(parsed.phone).toBeNull();
    expect(parsed.role).toBeNull();
    expect(parsed.description).toBeNull();
  });

  it("defaults a missing is_primary flag to false", () => {
    const parsed = clientContactSchema.parse({ first_name: "No Flag" });
    expect(parsed.is_primary).toBe(false);
  });

  it("normalizes a blank gender to null and accepts a valid one", () => {
    expect(clientContactSchema.parse({ first_name: "X", gender: "" }).gender).toBeNull();
    expect(clientContactSchema.parse({ first_name: "X", gender: "female" }).gender).toBe("female");
  });

  it("rejects an invalid gender", () => {
    expect(clientContactSchema.safeParse({ first_name: "X", gender: "unicorn" }).success).toBe(false);
  });

  it("accepts an omitted id (new contact) and a valid uuid id (existing contact)", () => {
    expect(clientContactSchema.safeParse({ first_name: "New" }).success).toBe(true);
    const parsed = clientContactSchema.parse({
      id: "90000001-0000-4000-8000-000000000001",
      first_name: "Existing",
    });
    expect(parsed.id).toBe("90000001-0000-4000-8000-000000000001");
  });

  it("rejects a non-uuid id", () => {
    expect(clientContactSchema.safeParse({ id: "not-a-uuid", first_name: "X" }).success).toBe(false);
  });
});
