//
//  StorageSetupViewController.swift
//  atomeAudioUnit
//
//  Created by AI Assistant on 06/08/2025.
//

import UIKit
import SwiftUI

class StorageSetupViewController: UIViewController {
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
    }
    
    private func setupUI() {
        view.backgroundColor = .systemBackground
        
        // Stack principal
        let stackView = UIStackView()
        stackView.axis = .vertical
        stackView.spacing = 20
        stackView.alignment = .center
        stackView.distribution = .fill
        stackView.translatesAutoresizingMaskIntoConstraints = false
        
        // Logo/Icon
        let iconImageView = UIImageView()
        iconImageView.image = UIImage(systemName: "icloud.and.arrow.down")
        iconImageView.tintColor = .systemBlue
        iconImageView.contentMode = .scaleAspectFit
        iconImageView.translatesAutoresizingMaskIntoConstraints = false
        
        // Titre
        let titleLabel = UILabel()
        titleLabel.text = "Configuration du stockage"
        titleLabel.font = .systemFont(ofSize: 24, weight: .bold)
        titleLabel.textAlignment = .center
        titleLabel.numberOfLines = 0
        
        // Description
        let descriptionLabel = UILabel()
        descriptionLabel.text = """
        Choisissez où vous souhaitez stocker vos fichiers Atome.
        
        Vous pourrez changer ce choix plus tard dans les réglages.
        """
        descriptionLabel.font = .systemFont(ofSize: 16)
        descriptionLabel.textAlignment = .center
        descriptionLabel.numberOfLines = 0
        descriptionLabel.textColor = .secondaryLabel
        
        // Bouton iCloud
        let iCloudButton = createStorageButton(
            title: "Utiliser iCloud",
            subtitle: "Synchronisé entre vos appareils",
            icon: "icloud",
            isRecommended: true
        )
        iCloudButton.addTarget(self, action: #selector(selectiCloudStorage), for: .touchUpInside)
        
        // Bouton Local
        let localButton = createStorageButton(
            title: "Stockage local",
            subtitle: "Seulement sur cet appareil",
            icon: "folder",
            isRecommended: false
        )
        localButton.addTarget(self, action: #selector(selectLocalStorage), for: .touchUpInside)
        
        // Bouton "Plus tard"
        let laterButton = UIButton(type: .system)
        laterButton.setTitle("Décider plus tard", for: .normal)
        laterButton.titleLabel?.font = .systemFont(ofSize: 16)
        laterButton.addTarget(self, action: #selector(decideLater), for: .touchUpInside)
        
        // Ajouter à la stack
        stackView.addArrangedSubview(iconImageView)
        stackView.addArrangedSubview(titleLabel)
        stackView.addArrangedSubview(descriptionLabel)
        stackView.addArrangedSubview(iCloudButton)
        stackView.addArrangedSubview(localButton)
        stackView.addArrangedSubview(laterButton)
        
        view.addSubview(stackView)
        
        // Contraintes
        NSLayoutConstraint.activate([
            iconImageView.heightAnchor.constraint(equalToConstant: 60),
            iconImageView.widthAnchor.constraint(equalToConstant: 60),
            
            stackView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            stackView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            stackView.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 40),
            stackView.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -40),
            
            iCloudButton.heightAnchor.constraint(equalToConstant: 80),
            localButton.heightAnchor.constraint(equalToConstant: 80),
            iCloudButton.leadingAnchor.constraint(equalTo: stackView.leadingAnchor),
            iCloudButton.trailingAnchor.constraint(equalTo: stackView.trailingAnchor),
            localButton.leadingAnchor.constraint(equalTo: stackView.leadingAnchor),
            localButton.trailingAnchor.constraint(equalTo: stackView.trailingAnchor)
        ])
        
        // Désactiver le bouton iCloud si pas disponible
        if !iCloudFileManager.shared.iCloudAvailable {
            iCloudButton.isEnabled = false
            iCloudButton.alpha = 0.5
        }
    }
    
    private func createStorageButton(title: String, subtitle: String, icon: String, isRecommended: Bool) -> UIButton {
        let button = UIButton(type: .system)
        button.backgroundColor = isRecommended ? .systemBlue.withAlphaComponent(0.1) : .systemGray6
        button.layer.cornerRadius = 12
        button.layer.borderWidth = isRecommended ? 2 : 1
        button.layer.borderColor = isRecommended ? UIColor.systemBlue.cgColor : UIColor.systemGray4.cgColor
        
        // Stack horizontale pour le contenu
        let contentStack = UIStackView()
        contentStack.axis = .horizontal
        contentStack.spacing = 16
        contentStack.alignment = .center
        contentStack.isUserInteractionEnabled = false
        contentStack.translatesAutoresizingMaskIntoConstraints = false
        
        // Icon
        let iconImageView = UIImageView()
        iconImageView.image = UIImage(systemName: icon)
        iconImageView.tintColor = isRecommended ? .systemBlue : .label
        iconImageView.contentMode = .scaleAspectFit
        iconImageView.translatesAutoresizingMaskIntoConstraints = false
        
        // Stack verticale pour le texte
        let textStack = UIStackView()
        textStack.axis = .vertical
        textStack.spacing = 4
        textStack.alignment = .leading
        
        let titleLabel = UILabel()
        titleLabel.text = title
        titleLabel.font = .systemFont(ofSize: 18, weight: .semibold)
        titleLabel.textColor = isRecommended ? .systemBlue : .label
        
        let subtitleLabel = UILabel()
        subtitleLabel.text = subtitle
        subtitleLabel.font = .systemFont(ofSize: 14)
        subtitleLabel.textColor = .secondaryLabel
        
        textStack.addArrangedSubview(titleLabel)
        textStack.addArrangedSubview(subtitleLabel)
        
        // Badge "Recommandé"
        var badgeLabel: UILabel?
        if isRecommended {
            badgeLabel = UILabel()
            badgeLabel!.text = "Recommandé"
            badgeLabel!.font = .systemFont(ofSize: 12, weight: .medium)
            badgeLabel!.textColor = .white
            badgeLabel!.backgroundColor = .systemBlue
            badgeLabel!.textAlignment = .center
            badgeLabel!.layer.cornerRadius = 8
            badgeLabel!.clipsToBounds = true
            badgeLabel!.translatesAutoresizingMaskIntoConstraints = false
        }
        
        contentStack.addArrangedSubview(iconImageView)
        contentStack.addArrangedSubview(textStack)
        if let badge = badgeLabel {
            contentStack.addArrangedSubview(badge)
        }
        
        button.addSubview(contentStack)
        
        NSLayoutConstraint.activate([
            iconImageView.widthAnchor.constraint(equalToConstant: 30),
            iconImageView.heightAnchor.constraint(equalToConstant: 30),
            
            contentStack.leadingAnchor.constraint(equalTo: button.leadingAnchor, constant: 16),
            contentStack.trailingAnchor.constraint(equalTo: button.trailingAnchor, constant: -16),
            contentStack.centerYAnchor.constraint(equalTo: button.centerYAnchor)
        ])
        
        if let badge = badgeLabel {
            NSLayoutConstraint.activate([
                badge.widthAnchor.constraint(equalToConstant: 80),
                badge.heightAnchor.constraint(equalToConstant: 20)
            ])
        }
        
        return button
    }
    
    @objc private func selectiCloudStorage() {
        UserDefaults.standard.set(true, forKey: "AtomeUseICloud")
        UserDefaults.standard.set(true, forKey: "AtomeStorageChoiceMade")
        
        iCloudFileManager.shared.initializeFileStructure()
        
        showSuccessMessage(message: "iCloud configuré avec succès!")
        dismissSetup()
    }
    
    @objc private func selectLocalStorage() {
        UserDefaults.standard.set(false, forKey: "AtomeUseICloud")
        UserDefaults.standard.set(true, forKey: "AtomeStorageChoiceMade")
        
        iCloudFileManager.shared.initializeFileStructure()
        
        showSuccessMessage(message: "Stockage local configuré avec succès!")
        dismissSetup()
    }
    
    @objc private func decideLater() {
        UserDefaults.standard.set(false, forKey: "AtomeStorageChoiceMade")
        dismissSetup()
    }
    
    private func showSuccessMessage(message: String) {
        let alert = UIAlertController(title: "✅ Configuration terminée", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
    
    private func dismissSetup() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
            self.dismiss(animated: true)
        }
    }
}

// MARK: - SwiftUI Integration
struct StorageSetupView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> StorageSetupViewController {
        return StorageSetupViewController()
    }
    
    func updateUIViewController(_ uiViewController: StorageSetupViewController, context: Context) {
        // Rien à mettre à jour
    }
}
