import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.util.ArrayList;

import model.ClassModel;
import model.TermModel;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

import util.Utils;

import com.google.gson.Gson;

public class ClassScraper {
	private static final String URL = "http://osoc.berkeley.edu/OSOC/osoc?p_term=%s&p_list_all=Y";

	public static void main(String args[]) {
		System.out.println(getTerms());
	}

	public static String getTerms() {
		System.err.println("Starting parse...");
		TermModel[] terms = parseTerms();
		Gson gson = new Gson();
		return gson.toJson(terms);
	}

	private static TermModel[] parseTerms() {
		try {
			TermModel[] terms = new TermModel[Utils.TERMS.length];

			for (int i = 0; i < Utils.TERMS.length; i++) {
				String url = String.format(URL,
						URLEncoder.encode(Utils.TERMS[i], "UTF-8"));

				Document doc = Jsoup.connect(url).get();

				Element row = doc.select("input[name=p_list_all] + FONT")
						.first();
				String data = row.text();
				String[] dataPieces = data.split("[, ]");
				String updated = Utils.trim(dataPieces[0]);
				String year = Utils.trim(dataPieces[dataPieces.length - 1]);

				Elements classRows = doc
						.select("label[class=buttonlink b listbtn]");

				ArrayList<ClassModel> classModels = new ArrayList<ClassModel>();

				String previousPercentString = null;

				int numRows = classRows.size();
				for (int j = 0; j < numRows; j += 3) {
					String department = Utils.trim(classRows.get(j + 0).text());
					String number = Utils.trim(classRows.get(j + 1).text());

					float percent = (float) (i * numRows + j)
							/ (Utils.TERMS.length * numRows) * 100;
					String percentString = String.format("%.1f%%", percent);

					if (!percentString.equals(previousPercentString)) {
						System.err.println(percentString);
						previousPercentString = percentString;
					}

					ArrayList<ClassModel> newClassModels = DetailsScraper
							.getClassModel(Utils.TERMS[i], department, number);

					classModels.addAll(newClassModels);
				}
				TermModel term = new TermModel(Utils.TERMS_STRINGS[i], year,
						updated, classModels.toArray(new ClassModel[] {}));
				terms[i] = term;
			}
			return terms;
		} catch (UnsupportedEncodingException e) {
			e.printStackTrace();
			return null;
		} catch (IOException e) {
			e.printStackTrace();
			return null;
		}
	}
}
