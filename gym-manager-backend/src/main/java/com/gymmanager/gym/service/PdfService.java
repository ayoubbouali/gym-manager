package com.gymmanager.gym.service;

import com.gymmanager.gym.common.FileStorage;
import com.gymmanager.gym.domain.AppSetting;
import com.gymmanager.gym.repository.SettingRepository;
import com.gymmanager.gym.service.Views.*;
import com.gymmanager.gym.settings.ClubConfig;
import com.lowagie.text.*;
import com.lowagie.text.pdf.*;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

/** Generates the payment receipts (members) and salary receipts (staff) as PDF (A5). */
@Service
public class PdfService {
    private static final DateTimeFormatter FR = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter FR_TIME = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm");
    private static final Color BRAND = new Color(0xC6, 0x28, 0x28);
    private static final Color MUTED = new Color(0x66, 0x70, 0x85);
    private static final Color LINE = new Color(0xE5, 0xE7, 0xEB);
    private static final Color SOFT = new Color(0xF7, 0xF7, 0xF9);

    private static final Font TITLE = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 14, BRAND);
    private static final Font CLUB = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 12, Color.BLACK);
    private static final Font BOLD = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 9, Color.BLACK);
    private static final Font NORMAL = FontFactory.getFont(FontFactory.HELVETICA, 9, Color.BLACK);
    private static final Font SMALL = FontFactory.getFont(FontFactory.HELVETICA, 7.5f, MUTED);
    private static final Font LABEL = FontFactory.getFont(FontFactory.HELVETICA, 8, MUTED);
    private static final Font BIG = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 13, Color.BLACK);

    private static final String[] MONTHS = {"janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
            "septembre", "octobre", "novembre", "décembre"};

    private final FileStorage files;
    private final SettingRepository settingRepo;

    public PdfService(FileStorage files, SettingRepository settingRepo) {
        this.files = files;
        this.settingRepo = settingRepo;
    }

    static String money(BigDecimal v, String currency) {
        java.text.DecimalFormatSymbols sym = new java.text.DecimalFormatSymbols(Locale.FRANCE);
        sym.setGroupingSeparator(' ');
        sym.setDecimalSeparator(',');
        return new java.text.DecimalFormat("#,##0.00", sym).format(v.setScale(2, RoundingMode.HALF_UP)) + " " + currency;
    }

    static String date(LocalDate d) {
        return d == null ? "—" : d.format(FR);
    }

    static String month(String period) {
        YearMonth ym = YearMonth.parse(period);
        return MONTHS[ym.getMonthValue() - 1] + " " + ym.getYear();
    }

    // ---------------------------------------------------------------- receipts

    public record ReceiptData(PaymentView payment, MemberView member, SubscriptionView period, BigDecimal paidUpToThis) {
    }

    public byte[] receipt(ReceiptData d, ClubConfig cfg) {
        PaymentView p = d.payment();
        BigDecimal remaining = d.period().amount().subtract(d.paidUpToThis()).max(BigDecimal.ZERO);
        return render(cfg, "REÇU DE PAIEMENT", p.receiptNumber(), p.paidOn(), p.cancelled(), p.cancelReason(), doc -> {
            doc.add(parties("Adhérent", d.member().code() + " — " + d.member().firstName() + " " + d.member().lastName().toUpperCase(),
                    "Téléphone : " + d.member().phone()));

            PdfPTable t = table(new float[]{3.2f, 1.4f, 1.4f});
            header(t, "Désignation", "Mode", "Montant");
            cell(t, p.packName() + "\nPériode du " + date(p.periodStart()) + " au " + date(p.periodEnd()), NORMAL, Element.ALIGN_LEFT);
            cell(t, p.methodLabel(), NORMAL, Element.ALIGN_LEFT);
            cell(t, money(p.amount(), cfg.currency()), BOLD, Element.ALIGN_RIGHT);
            doc.add(t);

            PdfPTable sum = summary();
            sumRow(sum, "Montant de la période", money(d.period().amount(), cfg.currency()), NORMAL);
            sumRow(sum, "Total réglé (ce reçu inclus)", money(d.paidUpToThis(), cfg.currency()), NORMAL);
            sumRow(sum, "Reste à payer", money(remaining, cfg.currency()), remaining.signum() > 0 ? BOLD : NORMAL);
            doc.add(sum);

            Paragraph paid = new Paragraph("Montant reçu : " + money(p.amount(), cfg.currency()), BIG);
            paid.setSpacingBefore(10);
            doc.add(paid);
            if (p.note() != null && !p.note().isBlank()) doc.add(new Paragraph("Note : " + p.note(), NORMAL));
            Paragraph by = new Paragraph("Encaissé par " + p.createdBy() + " le " + p.createdAt().format(FR_TIME)
                    + (p.updatedAt() != null ? " · modifié par " + p.updatedBy() + " le " + p.updatedAt().format(FR_TIME) : ""), SMALL);
            by.setSpacingBefore(6);
            doc.add(by);
        });
    }

    // ---------------------------------------------------------------- salary receipts

    public record SalaryReceiptData(SalaryPaymentView payment, StaffView staff, BigDecimal due, BigDecimal paidUpToThis, SalaryDetail detail) {
    }

    public byte[] salaryReceipt(SalaryReceiptData d, ClubConfig cfg) {
        SalaryPaymentView p = d.payment();
        BigDecimal remaining = d.due().subtract(d.paidUpToThis()).max(BigDecimal.ZERO);
        return render(cfg, "REÇU DE SALAIRE", p.slipNumber(), p.paidOn(), p.cancelled(), p.cancelReason(), doc -> {
            StaffView s = d.staff();
            doc.add(parties("Bénéficiaire", s.code() + " — " + s.name(),
                    (s.function() != null ? s.function().label() : "") + (s.phone() == null || s.phone().isBlank() ? "" : " · " + s.phone())));

            Paragraph m = new Paragraph("Salaire de " + month(p.period()), BOLD);
            m.setSpacingAfter(4);
            doc.add(m);
            if (s.payMode() == com.gymmanager.gym.domain.PayMode.COMMISSION) {
                SalaryDetail det = d.detail();
                doc.add(new Paragraph("Commission : " + det.shareRaw() + " (" + det.sharePercent().toPlainString().replace('.', ',') + " %) du CA des adhérents inscrits du "
                        + date(det.from()) + " au " + date(det.to()), LABEL));
                PdfPTable t = table(new float[]{2.6f, 2.2f, 1.2f, 1.4f});
                header(t, "Adhérent", "Pack", "Inscrit le", "Prix");
                for (SalaryLineView l : det.lines()) {
                    cell(t, l.code() + " " + l.name(), NORMAL, Element.ALIGN_LEFT);
                    cell(t, l.pack(), NORMAL, Element.ALIGN_LEFT);
                    cell(t, date(l.registrationDate()), NORMAL, Element.ALIGN_LEFT);
                    cell(t, money(l.price(), cfg.currency()), NORMAL, Element.ALIGN_RIGHT);
                }
                if (det.lines().isEmpty()) {
                    PdfPCell c = new PdfPCell(new Phrase("Aucun adhérent inscrit dans la fenêtre de calcul.", LABEL));
                    c.setColspan(4);
                    c.setBorderColor(LINE);
                    c.setPadding(5);
                    t.addCell(c);
                }
                doc.add(t);
                doc.add(new Paragraph(money(det.base(), cfg.currency()) + " × " + det.shareRaw() + " = " + money(d.due(), cfg.currency()), BOLD));
            } else {
                doc.add(new Paragraph("Salaire fixe mensuel", LABEL));
            }

            PdfPTable sum = summary();
            sumRow(sum, "Salaire du mois", money(d.due(), cfg.currency()), NORMAL);
            sumRow(sum, "Total versé (ce reçu inclus)", money(d.paidUpToThis(), cfg.currency()), NORMAL);
            sumRow(sum, "Reste à verser", money(remaining, cfg.currency()), remaining.signum() > 0 ? BOLD : NORMAL);
            doc.add(sum);

            Paragraph paid = new Paragraph("Montant versé : " + money(p.amount(), cfg.currency()) + " · " + p.methodLabel(), BIG);
            paid.setSpacingBefore(10);
            doc.add(paid);
            if (p.note() != null && !p.note().isBlank()) doc.add(new Paragraph("Note : " + p.note(), NORMAL));
            Paragraph sign = new Paragraph("\nSignature du bénéficiaire :\n\n\n", NORMAL);
            doc.add(sign);
            doc.add(new Paragraph("Document interne de suivi des versements : il ne remplace pas un bulletin de paie légal. Saisi par "
                    + p.createdBy() + " le " + p.createdAt().format(FR_TIME) + ".", SMALL));
        });
    }

    // ---------------------------------------------------------------- layout helpers

    private interface Body {
        void write(Document doc) throws DocumentException;
    }

    private byte[] render(ClubConfig cfg, String title, String number, LocalDate date, boolean cancelled, String cancelReason, Body body) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Document doc = new Document(PageSize.A5, 32, 32, 30, 40);
        try {
            PdfWriter writer = PdfWriter.getInstance(doc, out);
            doc.addTitle(title + " " + number);
            doc.addCreator("Gym Manager");
            doc.open();

            PdfPTable head = new PdfPTable(new float[]{0.8f, 1.5f, 2f});
            head.setWidthPercentage(100);
            PdfPCell logo = new PdfPCell();
            logo.setBorder(Rectangle.NO_BORDER);
            Image img = logo();
            if (img != null) {
                img.scaleToFit(84, 54);
                logo.addElement(img);
            } else {
                PdfPCell mark = new PdfPCell(new Phrase(initials(cfg.clubName()), FontFactory.getFont(FontFactory.HELVETICA_BOLD, 14, Color.WHITE)));
                mark.setBackgroundColor(BRAND);
                mark.setFixedHeight(40);
                mark.setHorizontalAlignment(Element.ALIGN_CENTER);
                mark.setVerticalAlignment(Element.ALIGN_MIDDLE);
                mark.setBorder(Rectangle.NO_BORDER);
                PdfPTable box = new PdfPTable(1);
                box.setTotalWidth(40);
                box.setLockedWidth(true);
                box.setHorizontalAlignment(Element.ALIGN_LEFT);
                box.addCell(mark);
                logo.addElement(box);
            }
            head.addCell(logo);
            PdfPCell club = new PdfPCell();
            club.setBorder(Rectangle.NO_BORDER);
            club.addElement(new Paragraph(cfg.clubName(), CLUB));
            if (!cfg.clubAddress().isBlank()) club.addElement(new Paragraph(cfg.clubAddress(), SMALL));
            if (!cfg.clubPhone().isBlank()) club.addElement(new Paragraph("Tél. " + cfg.clubPhone(), SMALL));
            head.addCell(club);
            PdfPCell right = new PdfPCell();
            right.setBorder(Rectangle.NO_BORDER);
            Paragraph t = new Paragraph(title, TITLE);
            t.setAlignment(Element.ALIGN_RIGHT);
            right.addElement(t);
            Paragraph n = new Paragraph("N° " + number + "\nDate : " + date(date), BOLD);
            n.setAlignment(Element.ALIGN_RIGHT);
            right.addElement(n);
            head.addCell(right);
            doc.add(head);
            line(doc);

            body.write(doc);

            if (cfg.documentFooter() != null && !cfg.documentFooter().isBlank()) {
                Paragraph f = new Paragraph(cfg.documentFooter(), LABEL);
                f.setAlignment(Element.ALIGN_CENTER);
                f.setSpacingBefore(14);
                doc.add(f);
            }
            if (cancelled) stamp(writer, doc, "ANNULÉ", cancelReason);
            doc.close();
        } catch (DocumentException e) {
            throw new IllegalStateException("Génération du PDF impossible", e);
        }
        return out.toByteArray();
    }

    /** Uploaded logo, otherwise the club's default logo shipped with the application. */
    private Image logo() {
        String name = settingRepo.findById("club.logoFile").map(AppSetting::getValue).orElse(null);
        Image custom = files.find(name).map(Path::toString).map(p -> {
            try {
                return Image.getInstance(p);
            } catch (Exception e) {
                return null;
            }
        }).orElse(null);
        if (custom != null) return custom;
        try (var in = PdfService.class.getResourceAsStream("/branding/logo.png")) {
            return in == null ? null : Image.getInstance(in.readAllBytes());
        } catch (Exception e) {
            return null;
        }
    }

    private static String initials(String name) {
        StringBuilder sb = new StringBuilder();
        for (String w : name.split("\\s+")) {
            if (!w.isBlank() && !w.equalsIgnoreCase("club") && sb.length() < 2) sb.append(Character.toUpperCase(w.charAt(0)));
        }
        return sb.isEmpty() ? "GM" : sb.toString();
    }

    private static void line(Document doc) throws DocumentException {
        PdfPTable l = new PdfPTable(1);
        l.setWidthPercentage(100);
        l.setSpacingBefore(6);
        l.setSpacingAfter(10);
        PdfPCell c = new PdfPCell();
        c.setBorder(Rectangle.BOTTOM);
        c.setBorderColor(BRAND);
        c.setBorderWidth(1.2f);
        c.setFixedHeight(2);
        l.addCell(c);
        doc.add(l);
    }

    private static PdfPTable parties(String label, String name, String sub) {
        PdfPTable t = new PdfPTable(1);
        t.setWidthPercentage(100);
        t.setSpacingAfter(10);
        PdfPCell c = new PdfPCell();
        c.setBackgroundColor(SOFT);
        c.setBorderColor(LINE);
        c.setPadding(8);
        c.addElement(new Paragraph(label, LABEL));
        c.addElement(new Paragraph(name, BOLD));
        if (sub != null && !sub.isBlank()) c.addElement(new Paragraph(sub, NORMAL));
        t.addCell(c);
        return t;
    }

    private static PdfPTable table(float[] widths) {
        PdfPTable t = new PdfPTable(widths);
        t.setWidthPercentage(100);
        t.setSpacingAfter(8);
        return t;
    }

    private static void header(PdfPTable t, String... titles) {
        for (int i = 0; i < titles.length; i++) {
            PdfPCell c = new PdfPCell(new Phrase(titles[i], FontFactory.getFont(FontFactory.HELVETICA_BOLD, 8, Color.WHITE)));
            c.setBackgroundColor(new Color(0x15, 0x19, 0x23));
            c.setPadding(5);
            c.setBorderColor(LINE);
            c.setHorizontalAlignment(i == titles.length - 1 ? Element.ALIGN_RIGHT : Element.ALIGN_LEFT);
            t.addCell(c);
        }
    }

    private static void cell(PdfPTable t, String text, Font font, int align) {
        PdfPCell c = new PdfPCell(new Phrase(text, font));
        c.setPadding(5);
        c.setBorderColor(LINE);
        c.setHorizontalAlignment(align);
        t.addCell(c);
    }

    private static PdfPTable summary() {
        PdfPTable t = new PdfPTable(new float[]{2.2f, 1.2f});
        t.setWidthPercentage(62);
        t.setHorizontalAlignment(Element.ALIGN_RIGHT);
        t.setSpacingBefore(4);
        return t;
    }

    private static void sumRow(PdfPTable t, String label, String value, Font font) {
        PdfPCell l = new PdfPCell(new Phrase(label, LABEL));
        l.setBorder(Rectangle.BOTTOM);
        l.setBorderColor(LINE);
        l.setPadding(4);
        PdfPCell v = new PdfPCell(new Phrase(value, font));
        v.setBorder(Rectangle.BOTTOM);
        v.setBorderColor(LINE);
        v.setPadding(4);
        v.setHorizontalAlignment(Element.ALIGN_RIGHT);
        t.addCell(l);
        t.addCell(v);
    }

    private static void stamp(PdfWriter writer, Document doc, String text, String reason) {
        PdfContentByte cb = writer.getDirectContent();
        PdfGState gs = new PdfGState();
        gs.setFillOpacity(0.25f);
        cb.saveState();
        cb.setGState(gs);
        ColumnText.showTextAligned(cb, Element.ALIGN_CENTER, new Phrase(text, FontFactory.getFont(FontFactory.HELVETICA_BOLD, 64, BRAND)),
                doc.getPageSize().getWidth() / 2, doc.getPageSize().getHeight() / 2, 35);
        cb.restoreState();
        if (reason != null && !reason.isBlank()) {
            ColumnText.showTextAligned(cb, Element.ALIGN_CENTER, new Phrase("Annulé : " + reason, FontFactory.getFont(FontFactory.HELVETICA_BOLD, 9, BRAND)),
                    doc.getPageSize().getWidth() / 2, 24, 0);
        }
    }

    /** Payments of a period up to (and including) a given payment, cancelled ones excluded. */
    public static BigDecimal paidUpTo(List<PaymentView> periodPayments, PaymentView p) {
        return periodPayments.stream().filter(x -> !x.cancelled() && x.id() <= p.id())
                .map(PaymentView::amount).reduce(BigDecimal.ZERO, BigDecimal::add).setScale(2, RoundingMode.HALF_UP);
    }
}
