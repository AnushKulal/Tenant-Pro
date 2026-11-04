// File: mobile/src/redesign/fonts.js
// Loads the redesign's two typefaces (Space Grotesk for the UI, Martian Mono for
// the eyebrow/label voice) via expo-font. Only the redesign root calls this, so
// v1 never pays for it. Weight → family names match src/redesign/theme.js FONT.
import { useFonts } from 'expo-font';
import {
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold
} from '@expo-google-fonts/space-grotesk';
import {
    MartianMono_400Regular,
    MartianMono_600SemiBold,
    MartianMono_700Bold
} from '@expo-google-fonts/martian-mono';

export function useRedesignFonts() {
    const [loaded] = useFonts({
        SpaceGrotesk_400Regular,
        SpaceGrotesk_500Medium,
        SpaceGrotesk_600SemiBold,
        SpaceGrotesk_700Bold,
        MartianMono_400Regular,
        MartianMono_600SemiBold,
        MartianMono_700Bold
    });
    return loaded;
}
