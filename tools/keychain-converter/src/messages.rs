//! Every text the dialogs show, in French and English (the macOS user locale
//! decides). Counts come from the report; no value or title is ever shown.

use atome_keychain_converter::report::Report;

pub const PLAINTEXT_WARNING: &str = "warning: the CXF output is NOT encrypted; every password it holds can be read by \
anyone who can read the file. Keep it only as long as the import takes, then delete it.";

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Lang {
    Fr,
    En,
}

pub struct Texts {
    pub lang: Lang,
}

impl Texts {
    fn pick(&self, fr: &'static str, en: &'static str) -> &'static str {
        if self.lang == Lang::Fr { fr } else { en }
    }

    pub fn title(&self) -> &'static str {
        self.pick(
            "Convertisseur de trousseaux atome",
            "atome keychain converter",
        )
    }
    pub fn choose_source(&self) -> &'static str {
        self.pick(
            "Choisissez l'export de votre gestionnaire de mots de passe (1Password .1pux ou data.1pif, CSV d'Apple Mots de passe ou d'un autre gestionnaire).",
            "Choose your password manager's export (1Password .1pux or data.1pif, CSV from Apple Passwords or another manager).",
        )
    }
    pub fn cancel(&self) -> &'static str {
        self.pick("Annuler", "Cancel")
    }
    pub fn convert(&self) -> &'static str {
        self.pick("Convertir", "Convert")
    }
    pub fn ok(&self) -> &'static str {
        "OK"
    }
    pub fn passphrase(&self, minimum: usize) -> String {
        match self.lang {
            Lang::Fr => format!(
                "Phrase secrète qui chiffrera le fichier ({minimum} caractères au moins). Sans elle, le fichier est illisible."
            ),
            Lang::En => format!(
                "Passphrase that will encrypt the file ({minimum} characters at least). Without it, the file cannot be read."
            ),
        }
    }
    pub fn passphrase_again(&self) -> &'static str {
        self.pick(
            "La même phrase secrète, une seconde fois.",
            "The same passphrase, once more.",
        )
    }
    pub fn passphrase_mismatch(&self) -> &'static str {
        self.pick(
            "Les deux phrases secrètes diffèrent.",
            "The two passphrases differ.",
        )
    }
    pub fn save(&self) -> &'static str {
        self.pick(
            "Enregistrer le trousseau converti",
            "Save the converted keychain",
        )
    }

    pub fn preview(&self, report: &Report) -> String {
        let mut text = match self.lang {
            Lang::Fr => format!(
                "{} éléments, {} coffres, {} compte(s), {} pièces jointes ({}).",
                report.items,
                report.collections,
                report.accounts,
                report.attachments,
                report.source_format
            ),
            Lang::En => format!(
                "{} items, {} vaults, {} account(s), {} attachments ({}).",
                report.items,
                report.collections,
                report.accounts,
                report.attachments,
                report.source_format
            ),
        };
        if report.archived + report.trashed > 0 {
            text.push_str(&match self.lang {
                Lang::Fr => format!(
                    "\nArchivés : {}, corbeille : {}.",
                    report.archived, report.trashed
                ),
                Lang::En => format!(
                    "\nArchived: {}, trash: {}.",
                    report.archived, report.trashed
                ),
            });
        }
        text
    }

    pub fn done(&self, report: &Report, path: &str) -> String {
        let mut text = match self.lang {
            Lang::Fr => format!(
                "{} éléments convertis en CXF 1.0, chiffrés dans :\n{path}",
                report.items
            ),
            Lang::En => format!(
                "{} items converted to CXF 1.0, encrypted in:\n{path}",
                report.items
            ),
        };
        text.push_str(self.pick(
            "\n\nPasskeys : les exports de fichiers n'en contiennent jamais. Transférez-les par Credential Exchange ou recréez-les.",
            "\n\nPasskeys: file exports never hold them. Move them by Credential Exchange or create them again.",
        ));
        if report.passkeys_found > 0 {
            text.push_str(&match self.lang {
                Lang::Fr => format!(
                    " ({} repérée(s) dans l'export, sans leur clé.)",
                    report.passkeys_found
                ),
                Lang::En => format!(
                    " ({} seen in the export, without their key.)",
                    report.passkeys_found
                ),
            });
        }
        if !report.source_keys_only_in_fidelity.is_empty() || report.custom_fields > 0 {
            text.push_str(self.pick(
                "\nCe que CXF ne décrit pas est gardé en champs personnalisés ou dans la sauvegarde de fidélité chiffrée.",
                "\nWhat CXF does not describe is kept as custom fields or in the encrypted fidelity backup.",
            ));
        }
        if !report.warnings.is_empty() {
            text.push_str(&match self.lang {
                Lang::Fr => format!(
                    "\n{} remarque(s) : voir le rapport à côté du fichier.",
                    report.warnings.len()
                ),
                Lang::En => format!(
                    "\n{} note(s): see the report next to the file.",
                    report.warnings.len()
                ),
            });
        }
        text
    }

    pub fn failed(&self, code: &str) -> String {
        match self.lang {
            Lang::Fr => format!("La conversion a échoué ({code})."),
            Lang::En => format!("The conversion failed ({code})."),
        }
    }
}
