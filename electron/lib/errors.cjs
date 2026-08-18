// Hataları kullanıcı diline çevirir. Teknik ayrıntı log dosyasında kalır;
// kullanıcı ne olduğunu ve ne yapabileceğini görür.
function friendlyError(err, context = '') {
    const msg = (err && err.message) || String(err);
    const code = err && err.code;

    let friendly;
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
        friendly = 'İnternet bağlantısı kurulamadı. Bağlantınızı kontrol edip tekrar deneyin.';
    } else if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ECONNREFUSED') {
        friendly = 'Sunucuya ulaşılamadı (bağlantı zaman aşımı). İnternetinizi kontrol edin veya birazdan tekrar deneyin.';
    } else if (code === 'ENOSPC') {
        friendly = 'Diskte yer kalmadı. Yer açıp tekrar deneyin.';
    } else if (code === 'EACCES' || code === 'EPERM') {
        friendly = 'Dosya erişim izni reddedildi. Antivirüs engelliyor olabilir veya launcher\'ı yönetici olarak deneyin.';
    } else if (code === 'EBUSY') {
        friendly = 'Bir dosya başka bir program tarafından kilitlenmiş (genellikle antivirüs). Birkaç saniye sonra tekrar deneyin.';
    } else if (code === 'EHASHMISMATCH') {
        friendly = 'İndirilen dosya bozuk çıktı ve reddedildi. Tekrar denendiğinde genellikle düzelir.';
    } else if (/HTTP 404/.test(msg)) {
        friendly = 'İstenen dosya kaynakta bulunamadı (404). Bu sürüm için içerik mevcut olmayabilir.';
    } else if (/HTTP 5\d\d/.test(msg)) {
        friendly = 'Karşı sunucu şu anda hata veriyor. Birazdan tekrar deneyin.';
    } else {
        friendly = msg;
    }

    return context ? `${context}\n${friendly}` : friendly;
}

module.exports = { friendlyError };
