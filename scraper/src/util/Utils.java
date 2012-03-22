package util;

import java.lang.reflect.Field;

import model.ClassModel;
import redis.clients.jedis.Jedis;
import redis.clients.jedis.Pipeline;

public class Utils {
	public static final String[] TERMS = { "SP", "SU", "FL" };
	public static final String[] TERMS_STRINGS = { "spring", "summer", "fall" };

	public static String trim(String text) {
		int start = text.length(), end = text.length();
		for (int i = 0; i < text.length(); i++) {
			char c = text.charAt(i);
			if (c >= '!' && c <= '~') {
				start = i;
				break;
			}
		}

		for (int i = text.length() - 1; i >= 0; i--) {
			char c = text.charAt(i);
			if (c >= '!' && c <= '~') {
				end = i + 1;
				break;
			}
		}

		if (start >= text.length() || start >= end) {
			return "";
		} else {
			return text.substring(start, end);
		}
	}

	private static final String REDIS_URL = "calchat.net";

	private static Jedis jedis = new Jedis(REDIS_URL);
	private static Pipeline pipeline;

	public static void save(ClassModel m) {
		String id = getClassId(m);
		for (String day : m.days.split("(?=\\p{Upper})")) {

			{ // classtimes
				String key = String.format("room:%s%s:%s:%s", m.buildingNumber,
						m.building, day, m.term).replace(" ", "");
				String field = m.time.replace(" ", "");

				synchronized (pipeline) {
					pipeline.hset(key, field, id);
				}
			}

			{ // classes
				try {
					for (Field field : ClassModel.class.getFields()) {
						String key = String.format("class:%s", id);
						String value = (String) field.get(m);

						synchronized (pipeline) {
							pipeline.hset(key, field.getName(), value);
						}
					}
				} catch (IllegalArgumentException e) {
					e.printStackTrace();
				} catch (IllegalAccessException e) {
					e.printStackTrace();
				}
			}
		}
	}

	public static String getClassId(ClassModel m) {
		return String.format("%s:%s:%s", m.department, m.number, m.term);
	}

	public static boolean connect() {
		try {
			jedis.connect();
			pipeline = jedis.pipelined();
			return true;
		} catch (Exception exception) {
			return false;
		}
	}
}
