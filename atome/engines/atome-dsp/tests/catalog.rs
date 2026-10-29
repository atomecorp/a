use atome_dsp::catalog::{CatalogError, ModuleAsset, ModuleKind, KINDS};
use atome_dsp::convolution::Impulse;
use atome_dsp::StereoBlock;

#[test]
fn every_kind_round_trips_its_key_and_builds() {
    for kind in KINDS {
        assert_eq!(ModuleKind::from_key(kind.key()).unwrap(), kind);
        let asset = match kind {
            ModuleKind::Amp => continue,
            ModuleKind::Convolution => ModuleAsset::Impulse(Impulse::new(vec![1.0, 0.5], None, 48000.0).unwrap()),
            _ => ModuleAsset::None,
        };
        let mut processor = kind.build(asset).unwrap();
        assert_eq!(processor.params().len(), kind.params().len(), "{}", kind.key());
        assert_eq!(processor.extra_outputs() + 1, kind.outputs(), "{}", kind.key());
        assert_eq!(processor.takes_key(), kind.takes_key(), "{}", kind.key());
        processor.prepare(48000.0, 64);
        let (mut left, mut right) = (vec![0.25; 64], vec![-0.25; 64]);
        processor.process(&mut StereoBlock::new(&mut left, &mut right));
        assert!(left.iter().chain(&right).all(|x| x.is_finite()), "{}", kind.key());
    }
    let keys: std::collections::HashSet<_> = KINDS.iter().map(|kind| kind.key()).collect();
    assert_eq!(keys.len(), KINDS.len(), "keys are unique");
}

#[test]
fn assets_are_checked() {
    assert!(matches!(ModuleKind::from_key("chorus"), Err(CatalogError::UnknownKind(_))));
    assert!(matches!(ModuleKind::Amp.build(ModuleAsset::None), Err(CatalogError::AssetRequired(_))));
    assert!(matches!(ModuleKind::Echo.build(ModuleAsset::AmpCapture(String::new())), Err(CatalogError::AssetNotExpected(_))));
    assert!(matches!(ModuleKind::Amp.build(ModuleAsset::AmpCapture("{".into())), Err(CatalogError::AmpCapture(_))));
    assert!(ModuleKind::Oscillator.is_generator());
}
