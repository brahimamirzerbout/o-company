import SwiftUI

// =============================================================================
// Design system
// =============================================================================
// Mirrors @o/brand/tokens.cream, gold, ink, etc. The same warm dark + gold
// aesthetic the web app uses. Every screen uses these tokens; no hardcoded
// colors anywhere else.

public enum Tokens {
    // Surfaces
    public static let ink      = Color(red: 0.07, green: 0.07, blue: 0.09)   // #121216
    public static let ink2     = Color(red: 0.10, green: 0.10, blue: 0.13)   // #1A1A21
    public static let ink3     = Color(red: 0.16, green: 0.16, blue: 0.20)   // #2A2A33
    public static let cream    = Color(red: 0.96, green: 0.94, blue: 0.91)   // #F5F0E8
    public static let cream2   = Color(red: 0.78, green: 0.76, blue: 0.72)   // #C7C2B8
    public static let cream3   = Color(red: 0.55, green: 0.53, blue: 0.49)   // #8C877D
    public static let cream4   = Color(red: 0.38, green: 0.36, blue: 0.33)   // #615C54

    // Accent
    public static let gold     = Color(red: 0.83, green: 0.66, blue: 0.33)   // #D4A853
    public static let goldSoft = Color(red: 0.83, green: 0.66, blue: 0.33).opacity(0.15)

    // Semantic
    public static let success  = Color(red: 0.48, green: 0.72, blue: 0.48)   // #7AB87A
    public static let warning  = Color(red: 0.98, green: 0.75, blue: 0.29)   // #FABF4A
    public static let danger   = Color(red: 0.78, green: 0.37, blue: 0.36)   // #C75F5C
    public static let info     = Color(red: 0.56, green: 0.78, blue: 0.93)   // #8FC7ED

    public static let successSoft = success.opacity(0.15)
    public static let warningSoft = warning.opacity(0.15)
    public static let dangerSoft  = danger.opacity(0.15)
    public static let infoSoft    = info.opacity(0.15)
}

// =============================================================================
// Typography
// =============================================================================
// Instrument Serif for headlines (matches the web). System font for body
// to avoid shipping a custom font in v1.

public enum Type {
    public static func serif(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .serif)
    }
    public static func mono(_ size: CGFloat = 13) -> Font {
        .system(size: size, weight: .regular, design: .monospaced)
    }
    public static func sans(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .default)
    }
}

// =============================================================================
// Reusable components
// =============================================================================

public struct Card<Content: View>: View {
    public let content: Content
    public var padding: CGFloat = 16
    public init(padding: CGFloat = 16, @ViewBuilder content: () -> Content) {
        self.padding = padding
        self.content = content()
    }
    public var body: some View {
        content
            .padding(padding)
            .background(Tokens.ink2)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(Tokens.ink3, lineWidth: 1)
            )
    }
}

public struct Pill: View {
    public let label: String
    public let tone: Tone
    public let icon: String?

    public enum Tone {
        case accent, info, success, warning, danger, neutral
        var color: Color {
            switch self {
            case .accent:  return Tokens.gold
            case .info:    return Tokens.info
            case .success: return Tokens.success
            case .warning: return Tokens.warning
            case .danger:  return Tokens.danger
            case .neutral: return Tokens.cream3
            }
        }
        var softColor: Color {
            switch self {
            case .accent:  return Tokens.goldSoft
            case .info:    return Tokens.infoSoft
            case .success: return Tokens.successSoft
            case .warning: return Tokens.warningSoft
            case .danger:  return Tokens.dangerSoft
            case .neutral: return Tokens.ink3
            }
        }
    }

    public init(_ label: String, tone: Tone = .neutral, icon: String? = nil) {
        self.label = label
        self.tone = tone
        self.icon = icon
    }

    public var body: some View {
        HStack(spacing: 4) {
            if let icon { Image(systemName: icon) }
            Text(label)
                .font(Type.sans(11, weight: .medium))
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .foregroundColor(tone.color)
        .background(tone.softColor)
        .clipShape(RoundedRectangle(cornerRadius: 3))
    }
}

public struct PrimaryButton: View {
    public let title: String
    public let icon: String?
    public let action: () -> Void
    public var disabled: Bool = false

    public init(_ title: String, icon: String? = nil, disabled: Bool = false, action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.disabled = disabled
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let icon { Image(systemName: icon) }
                Text(title)
            }
            .font(Type.sans(14, weight: .semibold))
            .foregroundColor(Tokens.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(disabled ? Tokens.ink3 : Tokens.gold)
            .clipShape(RoundedRectangle(cornerRadius: 3))
        }
        .disabled(disabled)
    }
}

public struct GhostButton: View {
    public let title: String
    public let icon: String?
    public let action: () -> Void

    public init(_ title: String, icon: String? = nil, action: @escaping () -> Void) {
        self.title = title
        self.icon = icon
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let icon { Image(systemName: icon) }
                Text(title)
            }
            .font(Type.sans(14))
            .foregroundColor(Tokens.cream2)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(Tokens.ink2)
            .overlay(
                RoundedRectangle(cornerRadius: 3)
                    .stroke(Tokens.ink3, lineWidth: 1)
            )
        }
    }
}

public struct Monogram: View {
    public let initials: String
    public let size: CGFloat
    public init(_ initials: String, size: CGFloat = 32) {
        self.initials = initials
        self.size = size
    }
    public var body: some View {
        ZStack {
            Circle()
                .fill(Tokens.goldSoft)
                .frame(width: size, height: size)
            Text(initials.uppercased())
                .font(Type.sans(size * 0.4, weight: .bold))
                .foregroundColor(Tokens.gold)
        }
    }
}

public struct StatTile: View {
    public let label: String
    public let value: String
    public let sub: String?

    public init(label: String, value: String, sub: String? = nil) {
        self.label = label
        self.value = value
        self.sub = sub
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label.uppercased())
                .font(Type.sans(10, weight: .medium))
                .tracking(1.5)
                .foregroundColor(Tokens.gold)
            Text(value)
                .font(Type.serif(24))
                .foregroundColor(Tokens.cream)
            if let sub {
                Text(sub)
                    .font(Type.sans(11))
                    .foregroundColor(Tokens.cream3)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Tokens.ink2)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .overlay(
            RoundedRectangle(cornerRadius: 6).stroke(Tokens.ink3, lineWidth: 1)
        )
    }
}
