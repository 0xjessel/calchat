import java.io.IOException;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;

import model.ClassModel;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.select.Elements;

import util.Utils;

public class DetailsScraper {
	private static final String URL = "http://osoc.berkeley.edu/OSOC/osoc?y=0&p_term=%s&p_deptname=--+Choose+a+Department+Name+--&p_classif=--+Choose+a+Course+Classification+--&p_course=%s&p_dept=%s&x=0";

	public static ClassModel[] getClassModel(String term, String department,
			String course) {
		try {

			String url = String.format(URL, URLEncoder.encode(term, "UTF-8"),
					URLEncoder.encode(course, "UTF-8"),
					URLEncoder.encode(department, "UTF-8"));

			Document doc = Jsoup.connect(url).get();

			Elements rows = doc.select("TABLE[BORDER=0]")
					.select("TABLE[CELLSPACING=2]")
					.select("TABLE[CELLPADDING=0]");

			ClassModel[] classModels = new ClassModel[rows.size() - 2];

			for (int i = 0; i < classModels.length; i++) {
				Element element = rows.get(i + 1); // skip first and last
				Elements data = element.select("tt");
				String title = data.get(0).text();
				String location = data.get(1).text();
				System.out.println(String.format("Found class: %s at %s", title, location));
			}

//			String data = row.text();
//			String[] dataPieces = data.split("[, ]");
//			String updated = Utils.trim(dataPieces[0]);
//			String year = Utils.trim(dataPieces[dataPieces.length - 1]);
//
//			Elements classRows = doc
//					.select("label[class=buttonlink b listbtn]");
//
//			ClassModel[] classModels = new ClassModel[classRows.size() / 3];
//
//			for (int j = 0; j < classRows.size(); j += 3) {
//				// String department = Utils.trim(classRows.get(j + 0).text());
//				String number = Utils.trim(classRows.get(j + 1).text());
//				String title = Utils.trim(classRows.get(j + 2).text());
//				ClassModel classModel = new ClassModel(department, number,
//						title);
//				classModels[j / 3] = classModel;
//			}

			// TermModel term = new TermModel(Utils.TERMS_STRINGS[i], year,
			// updated, classModels);
			return classModels;
		} catch (UnsupportedEncodingException e) {
			e.printStackTrace();
			return null;
		} catch (IOException e) {
			e.printStackTrace();
			return null;
		}
	}
}
