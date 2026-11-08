import UIKit

// The launch cover's gauge while a restore runs: the slider's look (`bevy_ui_slider_gauge.js`), its
// ground pressed in, its slab darker at the start and lit toward its rounded end, no bubble (a
// progress the finger does not set). Every value comes from the page's tokens (BootRestoreProgress).
final class BootRestoreGauge: UIView {
    private let fill = UIView()
    private let slab = CAGradientLayer()
    private let inset = CAShapeLayer()
    private var fraction = 0.0
    private var insetShadow = (color: UIColor.clear, blur: 0.0, offset: 0.0)
    private var size = CGSize.zero

    override init(frame: CGRect) {
        super.init(frame: frame)
        clipsToBounds = true
        layer.addSublayer(inset)
        addSubview(fill)
        fill.layer.addSublayer(slab)
        slab.startPoint = CGPoint(x: 0, y: 0.5)
        slab.endPoint = CGPoint(x: 1, y: 0.5)
        // The slab touching the gauge's start is cut straight by it; its free end is rounded.
        fill.layer.maskedCorners = [.layerMaxXMinYCorner, .layerMaxXMaxYCorner]
        fill.layer.masksToBounds = true
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override var intrinsicContentSize: CGSize { size }

    func show(_ progress: BootRestoreProgress) {
        let color = { (rgba: [Double]) in UIColor(red: rgba[0], green: rgba[1], blue: rgba[2], alpha: rgba[3]) }
        let dark = progress.accent.prefix(3).map { $0 * (1 - progress.fillDarken) } + [1]
        backgroundColor = color(progress.ground)
        layer.cornerRadius = progress.radius
        fill.layer.cornerRadius = progress.radius
        slab.colors = [color(dark).cgColor, color(progress.accent).cgColor]
        fraction = progress.fraction
        insetShadow = (color(progress.insetColor), progress.insetBlur, progress.insetOffset)
        if size != CGSize(width: progress.width, height: progress.height) {
            size = CGSize(width: progress.width, height: progress.height)
            invalidateIntrinsicContentSize()
        }
        setNeedsLayout()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        fill.frame = CGRect(x: 0, y: 0, width: bounds.width * fraction, height: bounds.height)
        slab.frame = fill.bounds
        // The pressed-in ground: a shadow cast inward by the band around the gauge.
        let reach = insetShadow.blur + abs(insetShadow.offset)
        let around = UIBezierPath(rect: bounds.insetBy(dx: -reach, dy: -reach))
        around.append(UIBezierPath(roundedRect: bounds, cornerRadius: layer.cornerRadius).reversing())
        inset.frame = bounds
        inset.path = around.cgPath
        inset.fillColor = insetShadow.color.cgColor
        inset.shadowPath = around.cgPath
        inset.shadowColor = insetShadow.color.cgColor
        inset.shadowOpacity = 1
        // A CSS-style blur is twice a Core Animation shadow radius.
        inset.shadowRadius = insetShadow.blur / 2
        inset.shadowOffset = CGSize(width: 0, height: insetShadow.offset)
    }
}
