package app.mindsetforest.phone

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.File
import java.io.FileNotFoundException

/**
 * The smallest FileProvider: serves only the downloaded update APKs, read-only,
 * to whoever the install intent granted the URI to. Not exported.
 */
class ApkProvider : ContentProvider() {
    override fun onCreate(): Boolean = true

    private fun fileFor(uri: Uri): File {
        val name = uri.lastPathSegment ?: throw FileNotFoundException()
        if (!name.matches(Regex("^mindsetforest-\\d+\\.apk$"))) throw FileNotFoundException(name)
        val f = File(UpdateJob.dir(context!!), name)
        if (!f.isFile) throw FileNotFoundException(name)
        return f
    }

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        if (mode != "r") throw SecurityException("read-only")
        return ParcelFileDescriptor.open(fileFor(uri), ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun getType(uri: Uri): String = APK_TYPE

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, args: Array<out String>?, sort: String?): Cursor {
        val f = fileFor(uri)
        return MatrixCursor(arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)).apply { addRow(arrayOf<Any>(f.name, f.length())) }
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = throw UnsupportedOperationException()
    override fun update(uri: Uri, values: ContentValues?, selection: String?, args: Array<out String>?): Int = throw UnsupportedOperationException()
    override fun delete(uri: Uri, selection: String?, args: Array<out String>?): Int = throw UnsupportedOperationException()

    companion object {
        const val APK_TYPE = "application/vnd.android.package-archive"

        fun uriFor(context: Context, file: File): Uri =
            Uri.Builder().scheme("content").authority("${context.packageName}.apk").appendPath(file.name).build()
    }
}
