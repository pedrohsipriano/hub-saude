package com.hubsaude.app;

import java.nio.charset.StandardCharsets;
import java.util.TimeZone;

/**
 * Quadros do protocolo do relógio (NJJ, quadro "BC") usados pelo serviço nativo, que roda mesmo com o app fechado.
 * Mesmo formato de src/devices/watch/njjProtocol.js:
 *   BC &lt;cmd&gt; &lt;controle&gt; &lt;tamanho&gt; &lt;dados…&gt; &lt;soma dos dados &amp; 0xFF&gt;
 */
final class NjjFrames {

    static final int CMD_ALERT_MSG = 0x0B; // notificação
    static final int CMD_DATE_TIME = 0x43; // hora
    static final int CMD_DRINK_WATER = 0x57; // lembrete de água próprio do relógio (SDK: EVT_TYPE_DRINK_WATER = 87)
    static final int CMD_PHONE_TYPE = 0x67; // tipo de celular
    static final int CONTROL_WRITE = 0x02;
    static final int PHONE_ANDROID = 0x02;

    // Limites da notificação no relógio (SDK: texto de até 120 bytes).
    static final int MAX_TITLE_BYTES = 60;
    static final int MAX_TEXT_BYTES = 120;

    private NjjFrames() {}

    /** Monta um quadro completo. */
    static byte[] frame(int cmd, int control, byte[] payload) {
        byte[] frame = new byte[payload.length + 5];
        frame[0] = (byte) 0xBC;
        frame[1] = (byte) cmd;
        frame[2] = (byte) control;
        frame[3] = (byte) payload.length;
        int sum = 0;
        for (int i = 0; i < payload.length; i++) {
            frame[4 + i] = payload[i];
            sum += payload[i] & 0xFF;
        }
        frame[frame.length - 1] = (byte) (sum & 0xFF);
        return frame;
    }

    /** Tipo de celular (o app oficial manda ao conectar). */
    /**
     * Lembrete de água próprio do relógio: [ligado][intervalo][início hh mm][fim hh mm] (SDK: setDrinkWater).
     * Ligado, ele toca no horário do relógio, fora de sincronia com o lembrete do celular. O app o desliga e
     * repassa o lembrete do celular ao relógio na mesma hora (HubNotificationListener). Intervalo e horário
     * são os que o MActivePro gravou no log (05, 08:30 às 18:30); com o lembrete desligado, não fazem diferença.
     */
    static byte[] drinkWater(boolean enabled) {
        return frame(CMD_DRINK_WATER, CONTROL_WRITE, new byte[] { (byte) (enabled ? 1 : 0), 0x05, 0x08, 0x1E, 0x12, 0x1E });
    }

    static byte[] phoneType() {
        return frame(CMD_PHONE_TYPE, CONTROL_WRITE, new byte[] { (byte) PHONE_ANDROID });
    }

    /** Hora: segundos desde 1970 contando a hora LOCAL como se fosse UTC (u32 little-endian). */
    static byte[] time(long nowMs) {
        long local = (nowMs + TimeZone.getDefault().getOffset(nowMs)) / 1000L;
        return frame(CMD_DATE_TIME, CONTROL_WRITE, new byte[] {
            (byte) (local & 0xFF), (byte) ((local >> 8) & 0xFF), (byte) ((local >> 16) & 0xFF), (byte) ((local >> 24) & 0xFF)
        });
    }

    /**
     * Notificação: [tipo][tam. título][tam. texto][título]["3A 20"][texto] (UTF-8, cortado em limite de caractere).
     * Igual ao SDK (sendMessage) e ao que o MActivePro envia (logs HCI).
     */
    static byte[] alert(int type, String title, String text) {
        byte[] titleBytes = truncateUtf8(title == null ? "" : title, MAX_TITLE_BYTES);
        String body = text == null || text.trim().isEmpty() ? " " : text;
        byte[] textBytes = truncateUtf8(body, MAX_TEXT_BYTES);
        byte[] payload = new byte[3 + titleBytes.length + 2 + textBytes.length];
        payload[0] = (byte) type;
        payload[1] = (byte) titleBytes.length;
        payload[2] = (byte) textBytes.length;
        System.arraycopy(titleBytes, 0, payload, 3, titleBytes.length);
        payload[3 + titleBytes.length] = 0x3A; // ":"
        payload[4 + titleBytes.length] = 0x20; // " "
        System.arraycopy(textBytes, 0, payload, 5 + titleBytes.length, textBytes.length);
        return frame(CMD_ALERT_MSG, CONTROL_WRITE, payload);
    }

    /** Texto em UTF-8 com no máximo `max` bytes, sem cortar um caractere ao meio. */
    static byte[] truncateUtf8(String text, int max) {
        byte[] bytes = text.replace('\n', ' ').getBytes(StandardCharsets.UTF_8);
        if (bytes.length <= max) return bytes;
        int end = max;
        // Volta enquanto o byte seguinte ao corte for continuação de um caractere (10xxxxxx).
        while (end > 0 && (bytes[end] & 0xC0) == 0x80) end--;
        byte[] cut = new byte[end];
        System.arraycopy(bytes, 0, cut, 0, end);
        return cut;
    }

    /** Bytes → "BC 0B 02 …" (para o app). */
    static String toHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 3);
        for (int i = 0; i < bytes.length; i++) {
            if (i > 0) builder.append(' ');
            builder.append(String.format("%02X", bytes[i] & 0xFF));
        }
        return builder.toString();
    }

    /** "BC 0B 02 …" → bytes. */
    static byte[] fromHex(String hex) {
        String clean = hex.replace(" ", "");
        byte[] bytes = new byte[clean.length() / 2];
        for (int i = 0; i < bytes.length; i++) bytes[i] = (byte) Integer.parseInt(clean.substring(i * 2, i * 2 + 2), 16);
        return bytes;
    }
}
